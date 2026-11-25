use super::*;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{path, query_param},
};
use worklens_core::Availability;

fn metadata(count: usize) -> Value {
    json!({"base":{"sha":"a".repeat(40)},"head":{"sha":"b".repeat(40),"repo":{"full_name":"fork/repo"}},"changed_files":count})
}
async fn setup(count: usize, final_response: Option<ResponseTemplate>) -> (MockServer, Github) {
    let server = MockServer::start().await;
    let calls = Arc::new(AtomicUsize::new(0));
    Mock::given(path("/repos/owner/repo/pulls/1"))
        .respond_with(move |_: &wiremock::Request| {
            if calls.fetch_add(1, Ordering::SeqCst) > 0
                && let Some(response) = &final_response
            {
                return response.clone();
            }
            ResponseTemplate::new(200).set_body_json(metadata(count))
        })
        .mount(&server)
        .await;
    let client = Github {
        api_base: server.uri(),
        test_token: Some("fixture-token".into()),
        ..Default::default()
    };
    (server, client)
}
fn rows(start: usize, count: usize) -> Value {
    json!(
        (start..start + count)
            .map(|i| json!({"filename":format!("libs/core/{i}.rs"),"status":"modified"}))
            .collect::<Vec<_>>()
    )
}
async fn page(server: &MockServer, n: usize, response: ResponseTemplate) {
    Mock::given(path("/repos/owner/repo/pulls/1/files"))
        .and(query_param("per_page", "100"))
        .and(query_param("page", n.to_string()))
        .respond_with(response)
        .expect(1)
        .mount(server)
        .await;
}

#[tokio::test]
async fn collects_all_pages_and_preserves_fork_rename_and_deletion() {
    let (server, client) = setup(102, None).await;
    page(
        &server,
        1,
        ResponseTemplate::new(200).set_body_json(rows(0, 100)),
    )
    .await;
    page(
        &server,
        2,
        ResponseTemplate::new(200).set_body_json(json!([
            {"filename":"apps/new.rs","previous_filename":"libs/old.rs","status":"renamed"},
            {"filename":"libs/deleted.rs","status":"removed"}
        ])),
    )
    .await;
    let result = client.collect_pr_files("owner/repo", 1).await.unwrap();
    assert_eq!(result.files.len(), 102);
    assert_eq!(result.pages_collected, 2);
    assert!(result.revision_verified);
    assert_eq!(result.provenance.status, Availability::Available);
    assert_eq!(
        result.revision.head_repository.as_deref(),
        Some("fork/repo")
    );
    assert_eq!(
        result.files[100].previous_path.as_deref(),
        Some("libs/old.rs")
    );
    assert_eq!(result.files[101].status, "removed");
}

#[tokio::test]
async fn late_page_failure_preserves_partial_files() {
    let (server, client) = setup(101, None).await;
    page(
        &server,
        1,
        ResponseTemplate::new(200).set_body_json(rows(0, 100)),
    )
    .await;
    page(&server, 2, ResponseTemplate::new(503)).await;
    let result = client.collect_pr_files("owner/repo", 1).await.unwrap();
    assert_eq!(result.files.len(), 100);
    assert!(result.revision_verified);
    assert_eq!(result.provenance.status, Availability::Partial);
}

#[tokio::test]
async fn rejects_duplicate_and_unsafe_pages() {
    for invalid in [
        rows(0, 1),
        json!([{"filename":"../outside","status":"modified"}]),
    ] {
        let (server, client) = setup(101, None).await;
        page(
            &server,
            1,
            ResponseTemplate::new(200).set_body_json(rows(0, 100)),
        )
        .await;
        page(
            &server,
            2,
            ResponseTemplate::new(200).set_body_json(invalid),
        )
        .await;
        let result = client.collect_pr_files("owner/repo", 1).await.unwrap();
        assert_eq!(result.files.len(), 100);
        assert_eq!(result.pages_collected, 1);
        assert_eq!(result.provenance.status, Availability::Partial);
    }
}

#[tokio::test]
async fn head_or_base_change_discards_mixed_files() {
    for field in ["head", "base"] {
        let mut final_pr = metadata(1);
        final_pr[field]["sha"] = json!("c".repeat(40));
        let (server, client) =
            setup(1, Some(ResponseTemplate::new(200).set_body_json(final_pr))).await;
        page(
            &server,
            1,
            ResponseTemplate::new(200).set_body_json(rows(0, 1)),
        )
        .await;
        let result = client.collect_pr_files("owner/repo", 1).await.unwrap();
        assert!(!result.revision_verified);
        assert!(result.files.is_empty());
        assert_eq!(result.provenance.status, Availability::Partial);
    }
}

#[tokio::test]
async fn final_authorization_failure_does_not_claim_verified_result() {
    let (server, client) = setup(1, Some(ResponseTemplate::new(401))).await;
    page(
        &server,
        1,
        ResponseTemplate::new(200).set_body_json(rows(0, 1)),
    )
    .await;
    let result = client.collect_pr_files("owner/repo", 1).await.unwrap();
    assert!(!result.revision_verified);
    assert_eq!(result.provenance.status, Availability::Partial);
    assert!(!result.warnings.join(" ").contains("fixture-token"));
}

#[tokio::test]
async fn empty_pr_needs_no_file_pages() {
    let (_server, client) = setup(0, None).await;
    let result = client.collect_pr_files("owner/repo", 1).await.unwrap();
    assert_eq!(result.pages_collected, 0);
    assert_eq!(result.provenance.status, Availability::Available);
}

#[tokio::test]
async fn github_file_cap_is_explicitly_partial() {
    let (server, client) = setup(3001, None).await;
    for n in 1..=30 {
        page(
            &server,
            n,
            ResponseTemplate::new(200).set_body_json(rows((n - 1) * 100, 100)),
        )
        .await;
    }
    let result = client.collect_pr_files("owner/repo", 1).await.unwrap();
    assert_eq!(result.files.len(), 3000);
    assert_eq!(result.pages_collected, 30);
    assert_eq!(result.provenance.status, Availability::Partial);
    assert!(result.warnings.iter().any(|w| w.contains("3000")));
}
