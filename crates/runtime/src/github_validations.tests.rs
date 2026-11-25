use super::*;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{path, query_param},
};
use worklens_core::*;

fn client(server: &MockServer) -> Github {
    Github {
        api_base: server.uri(),
        test_token: Some("fixture-token".into()),
        ..Default::default()
    }
}
fn check(id: u64, sha: &str, conclusion: &str) -> Value {
    json!({"id":id,"head_sha":sha,"name":format!("test-{id}"),"app":{"id":42},"status":"completed","conclusion":conclusion})
}

#[tokio::test]
async fn checks_are_paged_exact_sha_and_preserve_non_success() {
    let server = MockServer::start().await;
    let sha = "a".repeat(40);
    for page in 1..=2 {
        let rows = if page == 1 {
            (1..=100)
                .map(|i| check(i, &sha, "success"))
                .collect::<Vec<_>>()
        } else {
            vec![check(101, &sha, "cancelled")]
        };
        Mock::given(path(format!("/repos/o/r/commits/{sha}/check-runs")))
            .and(query_param("page", page.to_string()))
            .and(query_param("per_page", "100"))
            .and(query_param("filter", "latest"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_json(json!({"total_count":101,"check_runs":rows})),
            )
            .expect(1)
            .mount(&server)
            .await;
    }
    let (rows, source) = client(&server)
        .validation_source("o/r", &sha, ValidationKind::Check)
        .await;
    assert_eq!(rows.len(), 101);
    assert_eq!(source.status, Availability::Available);
    assert_eq!(rows[100].outcome, ValidationOutcome::Cancelled);
    assert_eq!(source.revision.as_deref(), Some(sha.as_str()));
}

#[tokio::test]
async fn invalid_sha_and_permissions_do_not_return_success() {
    for status in [200, 403] {
        let server = MockServer::start().await;
        let sha = "a".repeat(40);
        Mock::given(path(format!("/repos/o/r/commits/{sha}/check-runs")))
            .respond_with(ResponseTemplate::new(status).set_body_json(
                json!({"total_count":1,"check_runs":[check(1,&"b".repeat(40),"success")]}),
            ))
            .mount(&server)
            .await;
        let (rows, source) = client(&server)
            .validation_source("o/r", &sha, ValidationKind::Check)
            .await;
        assert!(rows.is_empty());
        assert_eq!(source.status, Availability::Unavailable);
    }
}

#[tokio::test]
async fn statuses_remain_usable_when_checks_are_unavailable() {
    let server = MockServer::start().await;
    let sha = "a".repeat(40);
    let github = client(&server);
    Mock::given(path(format!("/repos/o/r/commits/{sha}/status"))).respond_with(ResponseTemplate::new(200).set_body_json(json!({"sha":sha,"total_count":1,"statuses":[{"id":1,"context":"legacy","state":"pending"}]}))).mount(&server).await;
    let ((_, checks), (rows, statuses)) = tokio::join!(
        github.validation_source("o/r", &sha, ValidationKind::Check),
        github.validation_source("o/r", &sha, ValidationKind::Status)
    );
    assert_eq!(checks.status, Availability::Unavailable);
    assert_eq!(statuses.status, Availability::Available);
    assert_eq!(rows[0].outcome, ValidationOutcome::Pending);
}

#[tokio::test]
async fn late_failure_is_partial_even_with_successful_first_page() {
    let server = MockServer::start().await;
    let sha = "a".repeat(40);
    Mock::given(path(format!("/repos/o/r/commits/{sha}/check-runs"))).and(query_param("page","1")).respond_with(ResponseTemplate::new(200).set_body_json(json!({"total_count":101,"check_runs":(1..=100).map(|i|check(i,&sha,"success")).collect::<Vec<_>>()}))).mount(&server).await;
    let (rows, source) = client(&server)
        .validation_source("o/r", &sha, ValidationKind::Check)
        .await;
    assert_eq!(rows.len(), 100);
    assert_eq!(source.status, Availability::Partial);
}
