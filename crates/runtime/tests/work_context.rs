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
async fn create(s: &Service, root: &Path) {
    assert!(
        call(s, root, Operation::Open, json!({}))
            .await
            .error
            .is_none()
    );
    assert!(call(s, root, Operation::WorkCreate, json!({"id":"w","eventId":"create","actor":"test","expectedRevision":0,"change":{"action":"create","title":"Selected work","objective":"Only selected data","criteria":"bounded","links":[{"kind":"pr","reference":"https://github.com/owner/repo/pull/1","status":"candidate","reason":"Explicit candidate"}]}})).await.error.is_none());
}
fn selection(value: Value) -> Value {
    json!({"id":"w","expectedRevision":1,"selection":value,"limit":1,"maxBytes":200000})
}

#[tokio::test]
async fn confirmed_sources_use_cached_projects_and_scoped_agent_and_worktree_data() {
    let root = repo();
    let data = tempfile::tempdir().unwrap();
    std::fs::write(
        root.path().join("package.json"),
        r#"{"name":"local-project"}"#,
    )
    .unwrap();
    let service = Service::new(&data.path().join("db")).unwrap();
    create(&service, root.path()).await;
    let opened = call(&service, root.path(), Operation::Open, json!({})).await;
    let graph = call(&service, root.path(), Operation::Graph, json!({})).await;
    let project = graph.data["nodes"][0]["id"].as_str().unwrap();
    assert!(call(&service, root.path(), Operation::AgentStart, json!({"id":"linked","eventId":"agent-start","tool":"test","objective":"Declared work","worktree":opened.data["path"]})).await.error.is_none());
    for (i, (kind, reference)) in [
        ("component", json!(project)),
        ("agent", json!("linked")),
        ("worktree", opened.data["path"].clone()),
    ]
    .into_iter()
    .enumerate()
    {
        assert!(call(&service, root.path(), Operation::WorkLink, json!({"id":"w","eventId":format!("link-{i}"),"actor":"test","expectedRevision":i+1,"change":{"action":"link","link":{"kind":kind,"reference":reference,"status":"confirmed","reason":"Explicitly linked"}}})).await.error.is_none());
    }
    let exported = call(&service, root.path(), Operation::WorkContext, json!({"id":"w","expectedRevision":4,"selection":{"projectIds":[project],"agentIds":["linked"],"worktreePaths":[opened.data["path"]]}})).await;
    assert!(exported.error.is_none(), "{:?}", exported.error);
    let records = exported.data["items"].as_array().unwrap();
    assert_eq!(records.len(), 3);
    assert_eq!(records[0]["data"]["id"], project);
    assert_eq!(records[0]["sources"][0]["status"], "stale");
    assert_eq!(records[1]["data"]["id"], "linked");
    assert_eq!(records[2]["data"]["path"], opened.data["path"]);
    assert!(records[2]["data"].get("remotes").is_none());
    let db = rusqlite::Connection::open(data.path().join("db")).unwrap();
    db.execute("DELETE FROM cache", []).unwrap();
    let unavailable = call(
        &service,
        root.path(),
        Operation::WorkContext,
        json!({"id":"w","expectedRevision":4,"selection":{"projectIds":[project]}}),
    )
    .await;
    assert_eq!(
        unavailable.data["items"][0]["sources"][0]["status"],
        "unavailable"
    );
    assert_eq!(
        db.query_row("SELECT count(*) FROM cache", [], |r| r.get::<_, u32>(0))
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn export_is_selected_revision_bound_and_stable_across_pages() {
    let root = repo();
    let foreign = repo();
    let data = tempfile::tempdir().unwrap();
    let path = data.path().join("db");
    let service = Service::new(&path).unwrap();
    create(&service, root.path()).await;
    call(&service, foreign.path(), Operation::Open, json!({})).await;
    let export = call(
        &service,
        root.path(),
        Operation::WorkContext,
        selection(json!({"sections":["summary","links"]})),
    )
    .await;
    assert!(export.error.is_none(), "{:?}", export.error);
    assert_eq!(export.data["total"], 2);
    assert_eq!(export.data["nextOffset"], 1);
    assert_eq!(export.data["items"][0]["kind"], "summary");
    assert!(!export.data.to_string().contains("github.com/owner"));
    assert!(!export.data.to_string().contains("expectations"));
    let page = json!({"snapshotId":export.data["snapshotId"],"offset":1});
    let changed = call(&service, root.path(), Operation::WorkUnlink, json!({"id":"w","eventId":"unlink","actor":"test","expectedRevision":1,"change":{"action":"unlink","kind":"pr","reference":"https://github.com/owner/repo/pull/1"}})).await;
    assert!(changed.error.is_none());
    let second = call(
        &service,
        root.path(),
        Operation::WorkContextPage,
        page.clone(),
    )
    .await;
    assert_eq!(second.data["workRevision"], 1);
    assert_eq!(second.data["items"][0]["data"]["status"], "candidate");
    assert_eq!(second.data["nextOffset"], Value::Null);
    assert!(
        call(
            &service,
            foreign.path(),
            Operation::WorkContextPage,
            page.clone()
        )
        .await
        .error
        .is_some()
    );
    assert!(
        call(
            &service,
            root.path(),
            Operation::WorkContext,
            selection(json!({"sections":["summary"]}))
        )
        .await
        .error
        .unwrap()
        .contains("Revision conflict")
    );
    let work = call(
        &service,
        root.path(),
        Operation::WorkShow,
        json!({"id":"w"}),
    )
    .await;
    assert_eq!(work.data["item"]["revision"], 2);
    assert_eq!(work.data["events"].as_array().unwrap().len(), 2);
    drop(service);
    let service = Service::new(&path).unwrap();
    assert!(
        call(&service, root.path(), Operation::WorkContextPage, page)
            .await
            .error
            .unwrap()
            .contains("snapshot unavailable")
    );
}

#[tokio::test]
async fn context_documents_are_confined_partial_and_not_persisted() {
    let root = repo();
    let data = tempfile::tempdir().unwrap();
    std::fs::write(
        root.path().join("README.md"),
        "# Selected ```\n<script>alert('untrusted')</script>\n",
    )
    .unwrap();
    std::fs::write(root.path().join(".env"), "EXCLUDED_SECRET=do-not-export").unwrap();
    std::fs::write(data.path().join("outside.md"), "OUTSIDE_SECRET").unwrap();
    std::os::unix::fs::symlink(
        data.path().join("outside.md"),
        root.path().join("AGENTS.md"),
    )
    .unwrap();
    let service = Service::new(&data.path().join("db")).unwrap();
    create(&service, root.path()).await;
    let mut params =
        selection(json!({"documentPaths":["README.md","AGENTS.md",".env","../outside.md"]}));
    params["limit"] = json!(30);
    let exported = call(&service, root.path(), Operation::WorkContext, params).await;
    assert!(exported.error.is_none(), "{:?}", exported.error);
    assert_eq!(exported.data["items"].as_array().unwrap().len(), 4);
    assert!(
        exported.data["markdown"]
            .as_str()
            .unwrap()
            .contains("````json")
    );
    for item in exported.data["items"].as_array().unwrap().iter().skip(1) {
        assert_eq!(item["data"], Value::Null);
        assert_eq!(item["sources"][0]["status"], "unavailable");
    }
    assert!(!exported.data.to_string().contains("OUTSIDE_SECRET"));
    assert!(!exported.data.to_string().contains("EXCLUDED_SECRET"));
    let db = rusqlite::Connection::open(data.path().join("db")).unwrap();
    assert_eq!(
        db.query_row("SELECT count(*) FROM cache", [], |r| r.get::<_, u32>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        call(
            &service,
            root.path(),
            Operation::WorkShow,
            json!({"id":"w"})
        )
        .await
        .data["item"]["revision"],
        1
    );
}

#[tokio::test]
async fn context_limits_and_eviction_are_explicit() {
    let root = repo();
    let data = tempfile::tempdir().unwrap();
    let service = Service::new(&data.path().join("db")).unwrap();
    create(&service, root.path()).await;
    for input in [
        json!({}),
        json!({"sections":["logs"]}),
        json!({"sections":["summary","summary"]}),
        json!({"projectIds":["unlinked"]}),
        json!({"agentIds":["foreign"]}),
        json!({"worktreePaths":["/foreign"]}),
        json!({"documentPaths":["README.md","README.md"]}),
        json!({"documentPaths":[42]}),
        json!({"sections":["summary"],"includeSecrets":true}),
    ] {
        assert!(
            call(
                &service,
                root.path(),
                Operation::WorkContext,
                selection(input)
            )
            .await
            .error
            .is_some()
        );
    }
    let mut invalid = selection(json!({"sections":["summary"]}));
    invalid["maxBytes"] = json!(1);
    assert!(
        call(&service, root.path(), Operation::WorkContext, invalid)
            .await
            .error
            .is_some()
    );
    let mut first = Value::Null;
    for _ in 0..5 {
        let result = call(
            &service,
            root.path(),
            Operation::WorkContext,
            selection(json!({"sections":["summary"]})),
        )
        .await;
        assert!(result.error.is_none());
        if first.is_null() {
            first = result.data["snapshotId"].clone();
        }
    }
    assert!(
        call(
            &service,
            root.path(),
            Operation::WorkContextPage,
            json!({"snapshotId":first,"offset":0})
        )
        .await
        .error
        .is_some()
    );
    std::fs::write(root.path().join("README.md"), "z".repeat(5000)).unwrap();
    let mut params = selection(json!({"documentPaths":["README.md"]}));
    params["maxBytes"] = json!(4096);
    assert!(
        call(&service, root.path(), Operation::WorkContext, params)
            .await
            .error
            .unwrap()
            .contains("page budget")
    );
}

#[tokio::test]
async fn context_pages_respect_serialized_budget_and_snapshot_does_not_change_documents() {
    let root = repo();
    let data = tempfile::tempdir().unwrap();
    for path in ["README.md", "AGENTS.md", "CLAUDE.md"] {
        std::fs::write(root.path().join(path), "a".repeat(5000)).unwrap();
    }
    let service = Service::new(&data.path().join("db")).unwrap();
    create(&service, root.path()).await;
    let mut params = selection(json!({"documentPaths":["README.md","AGENTS.md","CLAUDE.md"]}));
    params["maxBytes"] = json!(16000);
    params["limit"] = json!(100);
    let first = call(&service, root.path(), Operation::WorkContext, params).await;
    assert!(first.error.is_none(), "{:?}", first.error);
    assert!(serde_json::to_string_pretty(&first.data).unwrap().len() < 16000);
    assert_eq!(first.data["nextOffset"], 1);
    std::fs::write(root.path().join("AGENTS.md"), "NEW_CONTENT").unwrap();
    let second = call(
        &service,
        root.path(),
        Operation::WorkContextPage,
        json!({"snapshotId":first.data["snapshotId"],"offset":1,"limit":1,"maxBytes":16000}),
    )
    .await;
    assert_eq!(second.data["items"][0]["data"]["text"], "a".repeat(5000));
    assert!(serde_json::to_string_pretty(&second.data).unwrap().len() < 16000);
    assert!(
        call(
            &service,
            root.path(),
            Operation::WorkContextPage,
            json!({"snapshotId":first.data["snapshotId"],"offset":4})
        )
        .await
        .error
        .is_some()
    );
}
