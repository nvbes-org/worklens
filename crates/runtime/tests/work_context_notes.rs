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
async fn call(s: &Service, root: &Path, operation: Operation, params: Value) -> Response {
    s.request(Request {
        version: PROTOCOL_VERSION,
        operation,
        repository: Some(root.to_string_lossy().into_owned()),
        params,
    })
    .await
}
async fn create(s: &Service, root: &Path, id: &str) {
    assert!(
        call(s, root, Operation::Open, json!({}))
            .await
            .error
            .is_none()
    );
    let r = call(s, root, Operation::WorkCreate, json!({"id":id,"eventId":format!("create-{id}"),"actor":"test","expectedRevision":0,"change":{"action":"create","title":"Notes","objective":"Selected notes","criteria":"","links":[]}})).await;
    assert!(r.error.is_none(), "{:?}", r.error);
}
async fn note(s: &Service, root: &Path, id: &str, revision: u32, event: &str, text: &str) {
    let r = call(s, root, Operation::WorkNote, json!({"id":id,"eventId":event,"actor":"declared agent","expectedRevision":revision,"change":{"action":"note","text":text}})).await;
    assert!(r.error.is_none(), "{:?}", r.error);
}
async fn export(s: &Service, root: &Path, revision: u32, selection: Value) -> Response {
    call(
        s,
        root,
        Operation::WorkContext,
        json!({"id":"w","expectedRevision":revision,"selection":selection}),
    )
    .await
}

#[tokio::test]
async fn notes_are_opt_in_ordered_scoped_and_revision_checked() {
    let root = repo();
    let other = repo();
    let data = tempfile::tempdir().unwrap();
    let service = Service::new(&data.path().join("db")).unwrap();
    create(&service, root.path(), "w").await;
    note(
        &service,
        root.path(),
        "w",
        1,
        "first",
        "<script>untrusted</script>\n```\nKEEP",
    )
    .await;
    note(&service, root.path(), "w", 2, "private", "NOT SELECTED").await;
    note(&service, root.path(), "w", 3, "last", "last note").await;
    let summary = export(&service, root.path(), 4, json!({"sections":["summary"]})).await;
    assert!(summary.error.is_none());
    assert!(!summary.data.to_string().contains("NOT SELECTED"));
    assert!(!summary.data.to_string().contains("untrusted"));
    let selected = export(
        &service,
        root.path(),
        4,
        json!({"noteIds":["last","first"]}),
    )
    .await;
    assert!(selected.error.is_none(), "{:?}", selected.error);
    let items = selected.data["items"].as_array().unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0]["key"], "last");
    assert_eq!(items[1]["kind"], "note");
    assert_eq!(items[1]["data"]["revision"], 2);
    assert_eq!(items[1]["data"]["actor"], "declared agent");
    assert_eq!(items[1]["sources"][0]["revision"], "2");
    assert_eq!(
        items[1]["sources"][0]["collectedAt"],
        items[1]["data"]["createdAt"]
    );
    assert!(!selected.data.to_string().contains("NOT SELECTED"));
    assert!(selected.data["markdown"].as_str().unwrap().contains("````"));
    for selection in [
        json!({"noteIds":["missing"]}),
        json!({"noteIds":["create-w"]}),
        json!({"noteIds":["first","first"]}),
        json!({"noteIds":[""]}),
    ] {
        assert!(
            export(&service, root.path(), 4, selection)
                .await
                .error
                .is_some()
        );
    }
    assert!(
        export(&service, root.path(), 3, json!({"noteIds":["first"]}))
            .await
            .error
            .unwrap()
            .contains("Revision conflict")
    );
    create(&service, root.path(), "other").await;
    note(
        &service,
        root.path(),
        "other",
        1,
        "other-work",
        "not this work",
    )
    .await;
    create(&service, other.path(), "w").await;
    note(
        &service,
        other.path(),
        "w",
        1,
        "other-repo",
        "not this repository",
    )
    .await;
    for id in ["other-work", "other-repo"] {
        assert!(
            export(&service, root.path(), 4, json!({"noteIds":[id]}))
                .await
                .error
                .unwrap()
                .contains("not found")
        );
    }
}

#[tokio::test]
async fn old_notes_survive_pagination_and_restart_without_automatic_history_export() {
    let root = repo();
    let data = tempfile::tempdir().unwrap();
    let db = data.path().join("db");
    let service = Service::new(&db).unwrap();
    create(&service, root.path(), "w").await;
    for i in 1..=52 {
        note(
            &service,
            root.path(),
            "w",
            i,
            &format!("note-{i}"),
            &format!("Text {i}"),
        )
        .await;
    }
    let history = call(
        &service,
        root.path(),
        Operation::WorkShow,
        json!({"id":"w"}),
    )
    .await;
    assert_eq!(history.data["nextOffset"], 50);
    assert!(
        !history.data["events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["eventId"] == "note-1")
    );
    let older = call(
        &service,
        root.path(),
        Operation::WorkShow,
        json!({"id":"w","offset":50}),
    )
    .await;
    assert_eq!(older.data["events"][1]["eventId"], "note-1");
    let selected = export(
        &service,
        root.path(),
        53,
        json!({"noteIds":["note-1","note-52"]}),
    )
    .await;
    assert!(selected.error.is_none());
    assert_eq!(selected.data["total"], 2);
    note(&service, root.path(), "w", 53, "new", "new private note").await;
    let page = call(
        &service,
        root.path(),
        Operation::WorkContextPage,
        json!({"snapshotId":selected.data["snapshotId"],"offset":1,"limit":1}),
    )
    .await;
    assert_eq!(page.data["workRevision"], 53);
    assert_eq!(page.data["items"][0]["key"], "note-52");
    drop(service);
    let service = Service::new(&db).unwrap();
    let after = export(
        &service,
        root.path(),
        54,
        json!({"noteIds":["note-1","note-52"]}),
    )
    .await;
    assert_eq!(selected.data["items"], after.data["items"]);
}

#[tokio::test]
async fn selected_note_obeys_page_byte_budget_without_silent_truncation() {
    let root = repo();
    let data = tempfile::tempdir().unwrap();
    let service = Service::new(&data.path().join("db")).unwrap();
    create(&service, root.path(), "w").await;
    let text = "é".repeat(4000);
    note(&service, root.path(), "w", 1, "large", &text).await;
    let small = call(
        &service,
        root.path(),
        Operation::WorkContext,
        json!({"id":"w","expectedRevision":2,"selection":{"noteIds":["large"]},"maxBytes":4096}),
    )
    .await;
    assert!(small.error.is_some());
    let full = export(&service, root.path(), 2, json!({"noteIds":["large"]})).await;
    assert!(full.error.is_none());
    assert_eq!(full.data["items"][0]["data"]["text"], text);
    assert!(serde_json::to_vec_pretty(&full.data).unwrap().len() < 200000);
}
