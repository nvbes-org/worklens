use crate::github::Github;
use serde_json::json;
use std::collections::BTreeMap;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{header, method, path},
};
use worklens_core::{CheckAnnotation, CheckRunPayload, WorkflowDispatchPayload};

fn client(server: &MockServer) -> Github {
    Github {
        api_base: server.uri(),
        test_token: Some("fixture-token".into()),
        ..Default::default()
    }
}

#[tokio::test]
async fn test_publish_check_run() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/repos/owner/repo/check-runs"))
        .and(header("authorization", "Bearer fixture-token"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({
            "id": 123456,
            "html_url": "https://github.com/owner/repo/runs/123456"
        })))
        .mount(&server)
        .await;

    let github = client(&server);
    let payload = CheckRunPayload {
        name: "worklens/architecture-boundary".into(),
        head_sha: "0123456789abcdef0123456789abcdef01234567".into(),
        status: "completed".into(),
        conclusion: Some("failure".into()),
        title: "Boundary violation detected".into(),
        summary: "1 violation found".into(),
        text: None,
        annotations: vec![CheckAnnotation {
            path: "apps/app/Cargo.toml".into(),
            start_line: 1,
            end_line: 1,
            annotation_level: "failure".into(),
            message: "Layer app cannot depend on db".into(),
            title: Some("Boundary violation".into()),
        }],
    };

    let result = crate::github_checks::publish_check_run(&github, "owner/repo", &payload)
        .await
        .unwrap();

    assert_eq!(result.check_run_id, 123456);
    assert_eq!(result.name, "worklens/architecture-boundary");
    assert_eq!(result.conclusion.as_deref(), Some("failure"));
}

#[tokio::test]
async fn test_dispatch_workflow() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/repos/owner/repo/actions/workflows/ci.yml/dispatches"))
        .respond_with(ResponseTemplate::new(204))
        .mount(&server)
        .await;

    let github = client(&server);
    let mut inputs = BTreeMap::new();
    inputs.insert("affected_projects".into(), "app,core".into());

    let payload = WorkflowDispatchPayload {
        workflow_id: "ci.yml".into(),
        ref_name: "main".into(),
        inputs,
    };

    let result = crate::github_dispatch::dispatch_workflow(&github, "owner/repo", &payload)
        .await
        .unwrap();

    assert!(result.success);
    assert_eq!(result.workflow_id, "ci.yml");
}

#[tokio::test]
async fn test_post_or_update_impact_comment_create_and_patch() {
    let server = MockServer::start().await;

    // Case 1: No existing comment -> POST
    Mock::given(method("GET"))
        .and(path("/repos/owner/repo/issues/42/comments"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([])))
        .mount(&server)
        .await;

    Mock::given(method("POST"))
        .and(path("/repos/owner/repo/issues/42/comments"))
        .respond_with(ResponseTemplate::new(201).set_body_json(json!({
            "id": 999,
            "html_url": "https://github.com/owner/repo/issues/42#issuecomment-999"
        })))
        .mount(&server)
        .await;

    let github = client(&server);
    let result = crate::github_comment::post_or_update_impact_comment(
        &github,
        "owner/repo",
        42,
        "<!-- worklens:pr-impact-summary --> Initial comment",
    )
    .await
    .unwrap();

    assert_eq!(result.action, "created");
    assert_eq!(result.comment_id, 999);

    // Case 2: Existing comment found -> PATCH
    let server2 = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/repos/owner/repo/issues/42/comments"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([
            {
                "id": 999,
                "body": "<!-- worklens:pr-impact-summary --> Previous report"
            }
        ])))
        .mount(&server2)
        .await;

    Mock::given(method("PATCH"))
        .and(path("/repos/owner/repo/issues/comments/999"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": 999,
            "html_url": "https://github.com/owner/repo/issues/42#issuecomment-999"
        })))
        .mount(&server2)
        .await;

    let github2 = client(&server2);
    let result2 = crate::github_comment::post_or_update_impact_comment(
        &github2,
        "owner/repo",
        42,
        "<!-- worklens:pr-impact-summary --> Updated report",
    )
    .await
    .unwrap();

    assert_eq!(result2.action, "updated");
    assert_eq!(result2.comment_id, 999);
}
