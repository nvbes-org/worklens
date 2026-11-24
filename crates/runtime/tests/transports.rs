use std::sync::Arc;
use tempfile::tempdir;
use worklens_core::{ConfigProfile, Operation, PROTOCOL_VERSION, Request};
use worklens_runtime::service::Service;

#[tokio::test]
async fn test_multi_transport_http_api_and_headers() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("test.sqlite3");
    let service = Arc::new(Service::new(&db_path).unwrap());
    service.transports.set_service(Arc::downgrade(&service));

    // 1. Prepare configuration profile with HTTP API on port 14040 and a required custom header
    let mut profile = ConfigProfile::default_local();
    profile.id = "profile_api_test".into();
    profile.transports.api_enabled = true;
    profile.transports.api_port = 14040;
    profile.transports.api_bind = "127.0.0.1".into();
    profile.network.headers.insert("X-Worklens-Auth".into(), "secret-token-123".into());

    // 2. Configure transports
    service.transports.reconfigure(&profile).await.unwrap();

    let status = service.transports.status(&profile).await;
    assert_eq!(status.active_profile_id, "profile_api_test");
    assert!(status.transports.iter().any(|t| t.name == "api" && t.running));

    let client = reqwest::Client::new();
    let base_url = "http://127.0.0.1:14040";

    // 3. Test /api/v1/health with required header
    let health_resp = client
        .get(format!("{base_url}/api/v1/health"))
        .header("X-Worklens-Auth", "secret-token-123")
        .send()
        .await
        .unwrap();
    assert_eq!(health_resp.status(), 200);
    let health_json: serde_json::Value = health_resp.json().await.unwrap();
    assert_eq!(health_json["status"], "ok");

    // 4. Test missing header rejected with 401
    let unauth_resp = client
        .get(format!("{base_url}/api/v1/health"))
        .send()
        .await
        .unwrap();
    assert_eq!(unauth_resp.status(), 401);

    // 5. Test POST /api/v1/request for Operation::Doctor
    let doc_req = Request {
        version: PROTOCOL_VERSION,
        operation: Operation::Doctor,
        repository: None,
        params: serde_json::json!({}),
    };
    let req_resp = client
        .post(format!("{base_url}/api/v1/request"))
        .header("X-Worklens-Auth", "secret-token-123")
        .json(&doc_req)
        .send()
        .await
        .unwrap();
    assert_eq!(req_resp.status(), 200);
    let resp_json: serde_json::Value = req_resp.json().await.unwrap();
    assert_eq!(resp_json["version"], 1);
    assert!(resp_json["error"].is_null());
    assert!(resp_json["data"]["tools"].is_array());

    // 6. Test dynamic disabling of transport
    service.transports.disable_transport("api").await.unwrap();
    let status_after = service.transports.status(&profile).await;
    assert!(status_after.transports.iter().any(|t| t.name == "api" && !t.running));
}
