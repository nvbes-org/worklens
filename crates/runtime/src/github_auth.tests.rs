use super::*;
use wiremock::{Mock, MockServer, ResponseTemplate, matchers::path};

#[tokio::test]
async fn device_flow_pending_slowdown_denial_and_expiry() {
    let server = MockServer::start().await;
    let auth = Auth {
        endpoint: server.uri(),
        ..Default::default()
    };
    Mock::given(path("/login/device/code")).respond_with(ResponseTemplate::new(200).set_body_json(json!({"device_code":"private-device-code","user_code":"PUBLIC-CODE","expires_in":900,"interval":5}))).mount(&server).await;
    let started = auth.start("fixture-app").await.unwrap();
    assert!(!started.to_string().contains("private-device-code"));
    let id = started["id"].as_str().unwrap();
    assert_eq!(auth.poll(id).await.unwrap()["status"], "pending");
    for code in ["authorization_pending", "slow_down", "access_denied"] {
        server.reset().await;
        auth.pending.lock().unwrap().get_mut(id).unwrap().next_poll = Instant::now();
        Mock::given(path("/login/oauth/access_token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({"error":code})))
            .mount(&server)
            .await;
        let result = auth.poll(id).await;
        if code == "access_denied" {
            assert!(result.is_err());
        } else {
            assert_eq!(result.unwrap()["status"], "pending");
        }
        if code == "slow_down" {
            assert_eq!(auth.pending.lock().unwrap().get(id).unwrap().interval, 10);
        }
    }
    assert!(auth.poll(id).await.is_err());
    auth.pending.lock().unwrap().insert(
        "expired".into(),
        Pending {
            client_id: "test".into(),
            device_code: "hidden".into(),
            expires: Instant::now(),
            next_poll: Instant::now(),
            interval: 5,
        },
    );
    assert!(auth.poll("expired").await.is_err());
}
