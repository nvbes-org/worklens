use serde_json::{Value, json};
use std::{path::Path, process::Command};
use tempfile::TempDir;
use worklens_core::{Operation, PROTOCOL_VERSION, Request};
use worklens_runtime::{git, service::Service};

fn git_cmd(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-c")
        .arg("commit.gpgsign=false")
        .args(args)
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
fn fixture() -> TempDir {
    let dir = tempfile::Builder::new()
        .prefix("worklens repo ")
        .tempdir()
        .unwrap();
    git_cmd(dir.path(), &["init", "-b", "main"]);
    git_cmd(dir.path(), &["config", "user.name", "Worklens Test"]);
    git_cmd(
        dir.path(),
        &["config", "user.email", "test@example.invalid"],
    );
    dir
}
fn commit(root: &Path) {
    git_cmd(root, &["add", "."]);
    git_cmd(root, &["commit", "-m", "fixture"]);
}
fn req(root: &Path, operation: Operation, params: Value) -> Request {
    Request {
        version: PROTOCOL_VERSION,
        operation,
        repository: Some(root.to_string_lossy().into_owned()),
        params,
    }
}

#[tokio::test]
async fn empty_repository_and_no_unrequested_mutations() {
    let dir = fixture();
    let repo = git::repository(dir.path(), false).await.unwrap();
    let snapshot = git::snapshot(repo, 0).await.unwrap();
    assert_eq!(snapshot.branch.as_deref(), Some("main"));
    assert!(snapshot.head.is_none());
    assert!(snapshot.commits.is_empty());
    assert!(snapshot.changes.is_empty());
    assert!(!dir.path().join(".worklens").exists());
}

#[tokio::test]
async fn worktrees_detached_heads_renames_binary_and_confined_diffs() {
    let dir = fixture();
    std::fs::write(dir.path().join("old name.txt"), "first\n").unwrap();
    std::fs::write(dir.path().join("image.bin"), [0, 1, 2, 3]).unwrap();
    commit(dir.path());
    git_cmd(
        dir.path(),
        &["remote", "add", "origin", "git@github.com:example/repo.git"],
    );
    git_cmd(dir.path(), &["mv", "old name.txt", "new name.txt"]);
    std::fs::write(dir.path().join("image.bin"), [0, 9, 8, 7]).unwrap();
    let other = tempfile::tempdir().unwrap();
    let tree = other.path().join("detached tree");
    git_cmd(
        dir.path(),
        &[
            "worktree",
            "add",
            "--detach",
            tree.to_str().unwrap(),
            "HEAD",
        ],
    );
    let repo = git::repository(dir.path(), false).await.unwrap();
    let snapshot = git::snapshot(repo.clone(), 0).await.unwrap();
    assert_eq!(snapshot.worktrees.len(), 2);
    assert!(snapshot.worktrees.iter().any(|t| t.branch.is_none()));
    assert_eq!(snapshot.remotes[0].url, "git@github.com:example/repo.git");
    assert!(
        snapshot
            .changes
            .iter()
            .any(|c| c.previous_path.as_deref() == Some("old name.txt"))
    );
    assert!(
        git::diff(dir.path(), Some("image.bin"), None, None, false)
            .await
            .unwrap()
            .binary
    );
    assert!(
        git::diff(dir.path(), Some("../outside"), None, None, false)
            .await
            .is_err()
    );
    let root_commit = git::diff(dir.path(), None, None, snapshot.head.as_deref(), false)
        .await
        .unwrap();
    assert!(root_commit.text.contains("first"));
    let detached = git::repository(&tree, false).await.unwrap();
    assert_eq!(detached.id, repo.id);
    assert!(git::snapshot(detached, 0).await.unwrap().branch.is_none());
}

#[tokio::test]
async fn conflicts_are_not_reported_as_clean() {
    let dir = fixture();
    std::fs::write(dir.path().join("file"), "base\n").unwrap();
    commit(dir.path());
    git_cmd(dir.path(), &["checkout", "-b", "other"]);
    std::fs::write(dir.path().join("file"), "other\n").unwrap();
    commit(dir.path());
    git_cmd(dir.path(), &["checkout", "main"]);
    std::fs::write(dir.path().join("file"), "main\n").unwrap();
    commit(dir.path());
    let output = Command::new("git")
        .args(["-c", "commit.gpgsign=false", "merge", "other"])
        .current_dir(dir.path())
        .output()
        .unwrap();
    assert!(!output.status.success());
    let repo = git::repository(dir.path(), false).await.unwrap();
    assert!(
        git::snapshot(repo, 0)
            .await
            .unwrap()
            .changes
            .iter()
            .any(|c| c.index_status == "U" && c.worktree_status == "U")
    );
}

#[tokio::test]
async fn agents_idempotency_presence_and_restart() {
    let dir = fixture();
    let db = tempfile::tempdir().unwrap();
    let service = Service::new(&db.path().join("state.db")).unwrap();
    let opened = service
        .request(req(dir.path(), Operation::Open, json!({})))
        .await;
    assert!(opened.error.is_none());
    let payload = json!({"id":"session", "eventId":"start", "worktree":dir.path(), "tool":"test-agent", "objective":"verify behavior"});
    let start = service
        .request(req(dir.path(), Operation::AgentStart, payload.clone()))
        .await;
    assert_eq!(start.data["applied"], true, "{:?}", start.error);
    let replay = service
        .request(req(dir.path(), Operation::AgentStart, payload))
        .await;
    assert_eq!(replay.data["applied"], false);
    let waiting = service
        .request(req(
            dir.path(),
            Operation::AgentUpdate,
            json!({"id":"session", "eventId":"wait", "state":"waiting"}),
        ))
        .await;
    assert_eq!(waiting.data["session"]["state"], "waiting");
    let (first, second) = tokio::join!(
        service.request(req(
            dir.path(),
            Operation::AgentHeartbeat,
            json!({"id":"session","eventId":"heartbeat"})
        )),
        service.request(req(
            dir.path(),
            Operation::AgentHeartbeat,
            json!({"id":"session","eventId":"heartbeat"})
        ))
    );
    assert!(first.error.is_none() && second.error.is_none());
    assert_ne!(first.data["applied"], second.data["applied"]);
    let finished = service
        .request(req(
            dir.path(),
            Operation::AgentFinish,
            json!({"id":"session","eventId":"finish"}),
        ))
        .await;
    assert_eq!(finished.data["session"]["state"], "completed");
    let stale = worklens_core::presence("2020-01-01T00:00:00Z", chrono::Utc::now());
    assert_eq!(stale, "unknown");
    drop(service);
    let restarted = Service::new(&db.path().join("state.db")).unwrap();
    let agents = restarted
        .request(req(dir.path(), Operation::Agents, json!({})))
        .await;
    assert_eq!(agents.data[0]["state"], "completed");
    let denied = restarted
        .request(req(
            dir.path(),
            Operation::AgentUpdate,
            json!({"id":"session","eventId":"late", "state":"active"}),
        ))
        .await;
    assert!(denied.error.is_some());
}

#[tokio::test]
async fn passive_catalog_context_trust_and_symlink_escape() {
    let dir = fixture();
    let db = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("libs/shared")).unwrap();
    std::fs::write(
        dir.path().join("package.json"),
        r#"{"name":"fixture","dependencies":{"shared":"workspace:*","react":"19"}}"#,
    )
    .unwrap();
    std::fs::write(
        dir.path().join("libs/shared/package.json"),
        r#"{"name":"shared"}"#,
    )
    .unwrap();
    std::fs::write(dir.path().join("nx.json"), "{}").unwrap();
    std::fs::write(dir.path().join("README.md"), "# Fixture\n").unwrap();
    let secret = db.path().join("secret");
    std::fs::write(&secret, "do not export").unwrap();
    std::fs::create_dir(dir.path().join("escape")).unwrap();
    std::os::unix::fs::symlink(secret, dir.path().join("escape/README.md")).unwrap();
    let service = Service::new(&db.path().join("state.db")).unwrap();
    service
        .request(req(dir.path(), Operation::Open, json!({})))
        .await;
    let graph = service
        .request(req(dir.path(), Operation::Graph, json!({})))
        .await;
    assert!(graph.error.is_none());
    assert_eq!(graph.data["nodes"].as_array().unwrap().len(), 3);
    assert!(
        graph.data["sources"]
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["source"] == "nx" && s["status"] == "unavailable")
    );
    let context = service
        .request(req(
            dir.path(),
            Operation::Context,
            json!({"sections":["projects"],"limit":1}),
        ))
        .await;
    assert_eq!(context.data["items"].as_array().unwrap().len(), 1);
    assert_eq!(context.data["nextOffset"], 1);
    assert!(!context.data.to_string().contains("do not export"));
    let document = service
        .request(req(
            dir.path(),
            Operation::Document,
            json!({"path":"escape/README.md"}),
        ))
        .await;
    assert!(document.error.is_some());
    let tasks = service
        .request(req(
            dir.path(),
            Operation::Tasks,
            json!({"project":"fixture","target":"build"}),
        ))
        .await;
    assert!(tasks.error.unwrap().contains("Trust"));
    assert!(!dir.path().join("node_modules").exists());
}
