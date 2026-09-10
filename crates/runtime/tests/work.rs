use serde_json::{Value, json};
use std::{path::Path, process::Command};
use tempfile::TempDir;
use worklens_core::{Operation, PROTOCOL_VERSION, Request};
use worklens_runtime::{service::Service, storage::Store};

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
async fn call(
    service: &Service,
    root: &Path,
    operation: Operation,
    params: Value,
) -> worklens_core::Response {
    service
        .request(Request {
            version: PROTOCOL_VERSION,
            operation,
            repository: Some(root.to_string_lossy().into_owned()),
            params,
        })
        .await
}
fn mutation(id: &str, event: &str, revision: u32, change: Value) -> Value {
    json!({"id":id,"eventId":event,"actor":"test (declared)","expectedRevision":revision,"change":change})
}
fn create() -> Value {
    json!({"action":"create","title":"Reference journey","objective":"Understand delivery","criteria":"All links inspectable","links":[]})
}

#[tokio::test]
async fn work_transactions_retries_conflicts_and_restart() {
    let root = repo();
    let data = tempfile::tempdir().unwrap();
    let path = data.path().join("db");
    let service = Service::new(&path).unwrap();
    call(&service, root.path(), Operation::Open, json!({})).await;
    let request = mutation("w1", "create", 0, create());
    let first = call(
        &service,
        root.path(),
        Operation::WorkCreate,
        request.clone(),
    )
    .await;
    assert_eq!(first.data["item"]["revision"], 1, "{:?}", first.error);
    assert_eq!(
        call(
            &service,
            root.path(),
            Operation::WorkCreate,
            request.clone()
        )
        .await
        .data["applied"],
        false
    );
    let mut reused = request;
    reused["change"]["title"] = json!("different");
    assert!(
        call(&service, root.path(), Operation::WorkCreate, reused)
            .await
            .error
            .unwrap()
            .contains("reused")
    );
    let note = mutation(
        "w1",
        "note",
        1,
        json!({"action":"note","text":"Local only"}),
    );
    let update = mutation(
        "w1",
        "update",
        1,
        json!({"action":"update","title":"Reference journey","objective":"Understand delivery","criteria":"All links inspectable","state":"completed"}),
    );
    let (a, b) = tokio::join!(
        call(&service, root.path(), Operation::WorkNote, note.clone()),
        call(&service, root.path(), Operation::WorkUpdate, update.clone())
    );
    assert_ne!(a.error.is_some(), b.error.is_some());
    let (winner, loser, replay_operation, replay_payload) = if a.error.is_none() {
        (a, b, Operation::WorkNote, note)
    } else {
        (b, a, Operation::WorkUpdate, update)
    };
    assert_eq!(winner.data["item"]["revision"], 2);
    assert!(loser.error.unwrap().contains("Revision conflict"));
    drop(service);
    let restarted = Service::new(&path).unwrap();
    let show = call(
        &restarted,
        root.path(),
        Operation::WorkShow,
        json!({"id":"w1"}),
    )
    .await;
    assert_eq!(show.data["events"].as_array().unwrap().len(), 2);
    assert_eq!(show.data["item"], winner.data["item"]);
    assert_eq!(
        call(&restarted, root.path(), replay_operation, replay_payload)
            .await
            .data["applied"],
        false
    );
    assert!(!root.path().join(".worklens").exists());
}

#[tokio::test]
async fn work_links_are_scoped_and_do_not_control_agents() {
    let a = repo();
    let b = repo();
    let data = tempfile::tempdir().unwrap();
    let service = Service::new(&data.path().join("db")).unwrap();
    for root in [&a, &b] {
        call(&service, root.path(), Operation::Open, json!({})).await;
    }
    call(
        &service,
        a.path(),
        Operation::WorkCreate,
        mutation("w", "create", 0, create()),
    )
    .await;
    assert!(
        call(&service, b.path(), Operation::WorkShow, json!({"id":"w"}))
            .await
            .error
            .is_some()
    );
    call(&service, b.path(), Operation::AgentStart, json!({"id":"foreign","eventId":"s1","tool":"test","objective":"unrelated","worktree":b.path()})).await;
    for (kind, reference) in [
        ("agent", "foreign".to_owned()),
        (
            "worktree",
            b.path()
                .canonicalize()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
        ),
        ("pr", "https://github.com.evil.invalid/a/b/pull/1".into()),
    ] {
        let result = call(&service, a.path(), Operation::WorkLink, mutation("w", &format!("bad-{kind}"), 1, json!({"action":"link","link":{"kind":kind,"reference":reference,"status":"confirmed","reason":"test"}}))).await;
        assert!(result.error.is_some(), "{result:?}");
    }
    call(
        &service,
        a.path(),
        Operation::AgentStart,
        json!({"id":"own","eventId":"s2","tool":"test","objective":"related","worktree":a.path()}),
    )
    .await;
    let linked = call(&service, a.path(), Operation::WorkLink, mutation("w", "link", 1, json!({"action":"link","link":{"kind":"agent","reference":"own","status":"candidate","reason":"Review this association"}}))).await;
    assert_eq!(linked.data["item"]["links"][0]["status"], "candidate");
    let confirmed = call(&service, a.path(), Operation::WorkLink, mutation("w", "confirm", 2, json!({"action":"link","link":{"kind":"agent","reference":"own","status":"confirmed","reason":"Confirmed explicitly"}}))).await;
    assert_eq!(confirmed.data["item"]["links"].as_array().unwrap().len(), 1);
    call(
        &service,
        a.path(),
        Operation::AgentFinish,
        json!({"id":"own","eventId":"s3"}),
    )
    .await;
    assert_eq!(
        call(&service, a.path(), Operation::WorkShow, json!({"id":"w"}))
            .await
            .data["item"]["state"],
        "todo"
    );
    let removed = call(
        &service,
        a.path(),
        Operation::WorkUnlink,
        mutation(
            "w",
            "unlink",
            3,
            json!({"action":"unlink","kind":"agent","reference":"own"}),
        ),
    )
    .await;
    assert!(removed.data["item"]["links"].as_array().unwrap().is_empty());
    assert_eq!(
        call(&service, a.path(), Operation::WorkShow, json!({"id":"w"}))
            .await
            .data["events"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    let mut unknown = mutation("x", "unknown", 0, create());
    unknown["change"]["extra"] = json!(true);
    assert!(
        call(&service, a.path(), Operation::WorkCreate, unknown)
            .await
            .error
            .is_some()
    );
}

#[test]
fn migration_preserves_existing_settings_and_refuses_future_versions() {
    let data = tempfile::tempdir().unwrap();
    let path = data.path().join("db");
    let connection = rusqlite::Connection::open(&path).unwrap();
    connection.execute_batch("CREATE TABLE settings (key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO settings VALUES ('existing','keep'); PRAGMA user_version=1;").unwrap();
    let store = Store::open(&path).unwrap();
    assert_eq!(store.setting("existing").unwrap().as_deref(), Some("keep"));
    drop(store);
    assert_eq!(
        connection
            .query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
            .unwrap(),
        2
    );
    connection.execute_batch("PRAGMA user_version=3").unwrap();
    assert!(Store::open(&path).is_err());
}

#[tokio::test]
async fn work_lists_and_history_are_paged_and_filtered() {
    let root = repo();
    let data = tempfile::tempdir().unwrap();
    let service = Service::new(&data.path().join("db")).unwrap();
    call(&service, root.path(), Operation::Open, json!({})).await;
    for i in 0..51 {
        let id = format!("w{i:02}");
        let result = call(
            &service,
            root.path(),
            Operation::WorkCreate,
            mutation(&id, &id, 0, create()),
        )
        .await;
        assert!(result.error.is_none());
    }
    let page = call(&service, root.path(), Operation::WorkList, json!({})).await;
    assert_eq!(page.data["items"].as_array().unwrap().len(), 50);
    assert_eq!(page.data["nextOffset"], 50);
    assert_eq!(
        call(
            &service,
            root.path(),
            Operation::WorkList,
            json!({"offset":50})
        )
        .await
        .data["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(
        call(
            &service,
            root.path(),
            Operation::WorkList,
            json!({"state":"completed"})
        )
        .await
        .data["items"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    for revision in 1..52 {
        assert!(
            call(
                &service,
                root.path(),
                Operation::WorkNote,
                mutation(
                    "w00",
                    &format!("note-{revision}"),
                    revision,
                    json!({"action":"note","text":"evidence"})
                )
            )
            .await
            .error
            .is_none()
        );
    }
    let history = call(
        &service,
        root.path(),
        Operation::WorkShow,
        json!({"id":"w00"}),
    )
    .await;
    assert_eq!(history.data["events"].as_array().unwrap().len(), 50);
    assert_eq!(history.data["nextOffset"], 50);
}
