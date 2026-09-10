use serde_json::{Value, json};
use std::{path::Path, process::Command};
use tempfile::TempDir;
use worklens_core::{Operation, PROTOCOL_VERSION, Request, Response};
use worklens_runtime::service::Service;

fn repo() -> TempDir {
    let dir = tempfile::tempdir().unwrap();
    assert!(
        Command::new("git")
            .args(["init", "-b", "main"])
            .arg(dir.path())
            .output()
            .unwrap()
            .status
            .success()
    );
    dir
}
async fn call(service: &Service, root: &Path, operation: Operation, params: Value) -> Response {
    service
        .request(Request {
            version: PROTOCOL_VERSION,
            operation,
            repository: Some(root.to_string_lossy().into_owned()),
            params,
        })
        .await
}
fn mutation(event: &str, revision: u32, change: Value) -> Value {
    json!({"id":"w","eventId":event,"actor":"test caller (declared)","expectedRevision":revision,"change":change})
}
fn request(id: &str) -> Value {
    json!({"action":"decision_request","decision":{"id":id,"question":"Accept this scope?","context":"Only the described local work; no execution.","options":["Accept","Reject"]}})
}
async fn create(service: &Service, root: &Path) {
    assert!(
        call(service, root, Operation::Open, json!({}))
            .await
            .error
            .is_none()
    );
    assert!(call(service, root, Operation::WorkCreate, mutation("create", 0,
        json!({"action":"create","title":"Decision test","objective":"Explicit scope","criteria":"","links":[]}))).await.error.is_none());
}

#[tokio::test]
async fn decisions_are_atomic_idempotent_scoped_and_persistent() {
    let root = repo();
    let foreign = repo();
    let data = tempfile::tempdir().unwrap();
    let path = data.path().join("db");
    let service = Service::new(&path).unwrap();
    create(&service, root.path()).await;
    call(&service, foreign.path(), Operation::Open, json!({})).await;
    let payload = mutation("request", 1, request("d"));
    let requested = call(
        &service,
        root.path(),
        Operation::WorkDecisionRequest,
        payload.clone(),
    )
    .await;
    assert!(requested.error.is_none(), "{:?}", requested.error);
    assert_eq!(requested.data["item"]["decisions"][0]["workRevision"], 1);
    assert_eq!(
        requested.data["item"]["decisions"][0]["resolution"]["state"],
        "pending"
    );
    assert_eq!(
        call(
            &service,
            root.path(),
            Operation::WorkDecisionRequest,
            payload.clone()
        )
        .await
        .data["applied"],
        false
    );
    assert!(
        call(
            &service,
            root.path(),
            Operation::WorkDecisionRequest,
            mutation("reuse-id", 2, request("d"))
        )
        .await
        .error
        .is_some()
    );
    let mut reused_event = payload;
    reused_event["change"]["decision"]["question"] = json!("Different");
    assert!(
        call(
            &service,
            root.path(),
            Operation::WorkDecisionRequest,
            reused_event
        )
        .await
        .error
        .unwrap()
        .contains("reused")
    );
    let answer = mutation(
        "answer",
        2,
        json!({"action":"decision_answer","id":"d","answer":"Accept","reason":"Within stated scope"}),
    );
    assert!(
        call(
            &service,
            foreign.path(),
            Operation::WorkDecisionAnswer,
            answer.clone()
        )
        .await
        .error
        .is_some()
    );
    let cancel = mutation(
        "cancel",
        2,
        json!({"action":"decision_cancel","id":"d","reason":"Superseded"}),
    );
    let (a, b) = tokio::join!(
        call(
            &service,
            root.path(),
            Operation::WorkDecisionAnswer,
            answer.clone()
        ),
        call(
            &service,
            root.path(),
            Operation::WorkDecisionCancel,
            cancel.clone()
        )
    );
    assert_ne!(a.error.is_none(), b.error.is_none());
    let (winner, operation, retry) = if a.error.is_none() {
        (a, Operation::WorkDecisionAnswer, answer)
    } else {
        (b, Operation::WorkDecisionCancel, cancel)
    };
    assert_eq!(winner.data["item"]["state"], "todo");
    assert_eq!(winner.data["item"]["revision"], 3);
    for change in [
        json!({"action":"decision_answer","id":"d","answer":"Reject","reason":"Overwrite"}),
        json!({"action":"decision_cancel","id":"d","reason":"Overwrite"}),
    ] {
        let op = if change["action"] == "decision_answer" {
            Operation::WorkDecisionAnswer
        } else {
            Operation::WorkDecisionCancel
        };
        assert!(
            call(&service, root.path(), op, mutation("closed", 3, change))
                .await
                .error
                .unwrap()
                .contains("already resolved")
        );
    }
    drop(service);
    let service = Service::new(&path).unwrap();
    assert_eq!(
        call(&service, root.path(), operation, retry).await.data["applied"],
        false
    );
    let shown = call(
        &service,
        root.path(),
        Operation::WorkShow,
        json!({"id":"w"}),
    )
    .await;
    assert_eq!(shown.data["item"], winner.data["item"]);
    assert_eq!(shown.data["events"].as_array().unwrap().len(), 3);
    assert_eq!(shown.data["events"][0]["actor"], "test caller (declared)");
    assert!(!root.path().join(".worklens").exists());
}

#[tokio::test]
async fn invalid_decision_fields_never_write_an_event() {
    let root = repo();
    let data = tempfile::tempdir().unwrap();
    let service = Service::new(&data.path().join("db")).unwrap();
    create(&service, root.path()).await;
    for (field, value) in [
        ("id", json!("")),
        ("question", json!("\0")),
        ("context", json!("x".repeat(8193))),
        ("options", json!(["One"])),
        ("options", json!(["One", "One"])),
        ("options", json!([" One", "Two"])),
        ("options", json!(["", "Two"])),
        ("options", json!(["x".repeat(201), "Two"])),
        (
            "options",
            json!((0..13).map(|i| i.to_string()).collect::<Vec<_>>()),
        ),
    ] {
        let mut change = request("d");
        change["decision"][field] = value;
        assert!(
            call(
                &service,
                root.path(),
                Operation::WorkDecisionRequest,
                mutation("invalid", 1, change)
            )
            .await
            .error
            .is_some()
        );
    }
    let mut extra = request("d");
    extra["decision"]["execute"] = json!(true);
    assert!(
        call(
            &service,
            root.path(),
            Operation::WorkDecisionRequest,
            mutation("extra", 1, extra)
        )
        .await
        .error
        .is_some()
    );
    assert!(
        call(
            &service,
            root.path(),
            Operation::WorkDecisionAnswer,
            mutation("wrong-op", 1, request("d"))
        )
        .await
        .error
        .is_some()
    );
    assert!(
        call(
            &service,
            root.path(),
            Operation::WorkDecisionRequest,
            mutation("request", 1, request("d"))
        )
        .await
        .error
        .is_none()
    );
    for change in [
        json!({"action":"decision_answer","id":"d","answer":"Other","reason":"Invalid"}),
        json!({"action":"decision_answer","id":"d","answer":"Accept","reason":" "}),
        json!({"action":"decision_cancel","id":"missing","reason":"Unknown"}),
    ] {
        let op = if change["action"] == "decision_answer" {
            Operation::WorkDecisionAnswer
        } else {
            Operation::WorkDecisionCancel
        };
        assert!(
            call(
                &service,
                root.path(),
                op,
                mutation("invalid-answer", 2, change)
            )
            .await
            .error
            .is_some()
        );
    }
    let shown = call(
        &service,
        root.path(),
        Operation::WorkShow,
        json!({"id":"w"}),
    )
    .await;
    assert_eq!(shown.data["item"]["revision"], 2);
    assert_eq!(shown.data["events"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn schema_three_items_upgrade_without_losing_prior_data() {
    let root = repo();
    let data = tempfile::tempdir().unwrap();
    let path = data.path().join("db");
    let service = Service::new(&path).unwrap();
    create(&service, root.path()).await;
    drop(service);
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute_batch(
        "UPDATE work_items SET value=json_remove(value,'$.decisions'); PRAGMA user_version=3;",
    )
    .unwrap();
    let service = Service::new(&path).unwrap();
    let shown = call(
        &service,
        root.path(),
        Operation::WorkShow,
        json!({"id":"w"}),
    )
    .await;
    assert_eq!(shown.data["item"]["decisions"], json!([]));
    assert_eq!(shown.data["item"]["title"], "Decision test");
    assert_eq!(shown.data["events"].as_array().unwrap().len(), 1);
    assert_eq!(
        db.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
            .unwrap(),
        4
    );
}
