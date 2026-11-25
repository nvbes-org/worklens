use super::*;
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{header, method, path, query_param},
};

fn client(server: &MockServer) -> Github {
    Github {
        api_base: server.uri(),
        test_token: Some("fixture-token".into()),
        ..Default::default()
    }
}

#[tokio::test]
async fn pagination_and_cancelled_ci() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/repos/owner/repo/actions/runs"))
        .and(query_param("page", "2"))
        .and(query_param("per_page", "30"))
        .respond_with(
            ResponseTemplate::new(200).set_body_json(
                json!({"workflow_runs":[{"head_sha":"abc","conclusion":"cancelled"}]}),
            ),
        )
        .mount(&server)
        .await;
    let response = client(&server)
        .query("owner/repo", &Operation::Ci, &json!({"page":2}))
        .await
        .unwrap();
    assert_eq!(response["page"], 2);
    assert_eq!(
        response["data"]["workflow_runs"][0]["conclusion"],
        "cancelled"
    );
}

#[tokio::test]
async fn etag_revalidation_and_rate_limit() {
    let server = MockServer::start().await;
    let github = client(&server);
    Mock::given(path("/data"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("etag", "\"v1\"")
                .set_body_json(json!([1])),
        )
        .up_to_n_times(1)
        .expect(1)
        .mount(&server)
        .await;
    assert_eq!(github.get("/data").await.unwrap(), json!([1]));
    Mock::given(path("/data"))
        .and(header("if-none-match", "\"v1\""))
        .respond_with(ResponseTemplate::new(304))
        .expect(1)
        .mount(&server)
        .await;
    assert_eq!(github.get("/data").await.unwrap(), json!([1]));
    Mock::given(path("/limited"))
        .respond_with(ResponseTemplate::new(429).insert_header("retry-after", "60"))
        .expect(1)
        .mount(&server)
        .await;
    assert!(
        github
            .get("/limited")
            .await
            .unwrap_err()
            .to_string()
            .contains("rate limit")
    );
    assert!(
        github
            .get("/limited")
            .await
            .unwrap_err()
            .to_string()
            .contains("deferred")
    );
}

#[tokio::test]
async fn expired_denied_and_unavailable_logs_do_not_expose_credentials() {
    let server = MockServer::start().await;
    let github = client(&server);
    for status in [401, 403, 404] {
        let route = format!("/status/{status}");
        Mock::given(path(route.clone()))
            .respond_with(ResponseTemplate::new(status).set_body_string("fixture-token"))
            .mount(&server)
            .await;
        let error = github.get(&route).await.unwrap_err().to_string();
        assert!(!error.contains("fixture-token"));
        if status == 401 {
            assert!(error.contains("reconnect"));
        }
    }
    Mock::given(path("/repos/owner/repo/actions/jobs/1/logs"))
        .respond_with(ResponseTemplate::new(404))
        .mount(&server)
        .await;
    assert!(
        github
            .query("owner/repo", &Operation::Logs, &json!({"number":1}))
            .await
            .is_err()
    );
}

#[tokio::test]
async fn fork_identity_exact_sha_and_partial_checks() {
    let server = MockServer::start().await;
    let github = client(&server);
    Mock::given(path("/repos/upstream/repo/pulls/7"))
        .respond_with(ResponseTemplate::new(200).set_body_json(
            json!({"head":{"sha":"abc123","ref":"feature","repo":{"full_name":"fork/repo"}}}),
        ))
        .mount(&server)
        .await;
    Mock::given(path("/repos/upstream/repo/commits/abc123/check-runs"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_json(json!({"check_runs":[{"name":"test","conclusion":"success"}]})),
        )
        .expect(1)
        .mount(&server)
        .await;
    let response = github
        .query("upstream/repo", &Operation::Pr, &json!({"number":7}))
        .await
        .unwrap();
    assert_eq!(
        response["data"]["pr"]["head"]["repo"]["full_name"],
        "fork/repo"
    );
    assert_eq!(
        response["data"]["checks"]["data"]["check_runs"][0]["name"],
        "test"
    );
    assert!(response["data"]["files"]["error"].is_string());
}
