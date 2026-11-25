use serde_json::json;
use std::{path::Path, process::Command};
use tempfile::TempDir;
use worklens_core::{Operation, PROTOCOL_VERSION, Request};
use worklens_runtime::{git, git_actions, service::Service};

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
        .prefix("worklens git actions ")
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

#[tokio::test]
async fn test_staging_committing_and_undo_via_service() {
    let dir = fixture();
    let service_dir = tempfile::tempdir().unwrap();
    let service = Service::new(&service_dir.path().join("state.db")).unwrap();

    // Register repo
    service
        .request(Request {
            version: PROTOCOL_VERSION,
            operation: Operation::Open,
            repository: Some(dir.path().to_string_lossy().into_owned()),
            params: json!({}),
        })
        .await;

    // Initial root commit
    let base_path = dir.path().join("base.txt");
    std::fs::write(&base_path, "base\n").unwrap();
    git_cmd(dir.path(), &["add", "."]);
    git_cmd(dir.path(), &["commit", "-m", "chore: initial"]);

    // Create a new file
    let file_path = dir.path().join("test.txt");
    std::fs::write(&file_path, "hello world\n").unwrap();

    // 1. Stage file
    let res = service
        .request(Request {
            version: PROTOCOL_VERSION,
            operation: Operation::GitAction,
            repository: Some(dir.path().to_string_lossy().into_owned()),
            params: json!({
                "action": "stage_file",
                "path": "test.txt"
            }),
        })
        .await;
    assert!(res.error.is_none(), "Stage file failed: {:?}", res.error);

    // Verify snapshot reports staged
    let repo = git::repository(dir.path(), false).await.unwrap();
    let snap = git::snapshot(repo.clone(), 0).await.unwrap();
    assert_eq!(snap.changes.len(), 1);
    assert_eq!(snap.changes[0].index_status, "A");

    // 2. Commit
    let res = service
        .request(Request {
            version: PROTOCOL_VERSION,
            operation: Operation::GitAction,
            repository: Some(dir.path().to_string_lossy().into_owned()),
            params: json!({
                "action": "commit",
                "message": "feat: second commit",
                "amend": false
            }),
        })
        .await;
    assert!(res.error.is_none(), "Commit failed: {:?}", res.error);

    let snap = git::snapshot(repo.clone(), 0).await.unwrap();
    assert_eq!(snap.commits.len(), 2);
    assert_eq!(snap.commits[0].subject, "feat: second commit");

    // 3. Inspect commit files
    let res = service
        .request(Request {
            version: PROTOCOL_VERSION,
            operation: Operation::CommitFiles,
            repository: Some(dir.path().to_string_lossy().into_owned()),
            params: json!({
                "sha": snap.commits[0].sha
            }),
        })
        .await;
    assert!(res.error.is_none());
    let files: Vec<String> = serde_json::from_value(res.data).unwrap();
    assert_eq!(files, vec!["test.txt"]);

    // 4. Test reflog
    let res = service
        .request(Request {
            version: PROTOCOL_VERSION,
            operation: Operation::GitReflog,
            repository: Some(dir.path().to_string_lossy().into_owned()),
            params: json!({ "limit": 10 }),
        })
        .await;
    assert!(res.error.is_none());
    let entries: Vec<worklens_core::ReflogEntry> = serde_json::from_value(res.data).unwrap();
    assert!(!entries.is_empty());
    assert!(entries[0].action.contains("commit"));

    // 5. Test undo commit (soft reset)
    let res = service
        .request(Request {
            version: PROTOCOL_VERSION,
            operation: Operation::GitAction,
            repository: Some(dir.path().to_string_lossy().into_owned()),
            params: json!({
                "action": "reset",
                "mode": "soft",
                "target": "HEAD~1"
            }),
        })
        .await;
    assert!(res.error.is_none());

    let snap = git::snapshot(repo.clone(), 0).await.unwrap();
    assert_eq!(snap.commits.len(), 1);
    assert_eq!(snap.commits[0].subject, "chore: initial");
    // Staged file is preserved!
    assert_eq!(snap.changes.len(), 1);
    assert_eq!(snap.changes[0].index_status, "A");
}

#[tokio::test]
async fn test_branch_actions_merge_rebase_checkout() {
    let dir = fixture();
    let root = dir.path();

    // Initial commit
    std::fs::write(root.join("base.txt"), "base\n").unwrap();
    git_cmd(root, &["add", "."]);
    git_cmd(root, &["commit", "-m", "initial commit"]);

    // Create and checkout feature branch
    git_cmd(root, &["checkout", "-b", "feature"]);
    std::fs::write(root.join("feat.txt"), "feat\n").unwrap();
    git_cmd(root, &["add", "."]);
    git_cmd(root, &["commit", "-m", "feature commit"]);

    // Checkout main
    git_actions::execute_action(root, &json!({ "action": "checkout", "branch": "main" }))
        .await
        .unwrap();

    // Fast-forward merge feature into main
    let res = git_actions::execute_action(
        root,
        &json!({ "action": "merge", "branch": "feature", "mode": "ff_only" }),
    )
    .await
    .unwrap();
    assert_eq!(res["success"], true);

    let repo = git::repository(root, false).await.unwrap();
    let snap = git::snapshot(repo, 0).await.unwrap();
    assert_eq!(snap.commits.len(), 2);
    assert_eq!(snap.commits[0].subject, "feature commit");
}

#[tokio::test]
async fn test_git_commands_branch_tag_and_raw() {
    let dir = fixture();
    let root = dir.path();

    std::fs::write(root.join("base.txt"), "base\n").unwrap();
    git_cmd(root, &["add", "."]);
    git_cmd(root, &["commit", "-m", "chore: base"]);

    // 1. Branch create & checkout
    let res = git_actions::execute_action(
        root,
        &json!({ "action": "branch_create", "name": "dev", "checkout": true }),
    )
    .await
    .unwrap();
    assert_eq!(res["success"], true);

    // 2. Branch rename
    let res = git_actions::execute_action(
        root,
        &json!({ "action": "branch_rename", "old_name": "dev", "new_name": "development" }),
    )
    .await
    .unwrap();
    assert_eq!(res["success"], true);

    // 3. Tag create
    let res = git_actions::execute_action(
        root,
        &json!({ "action": "tag_create", "name": "v1.0.0", "message": "First release" }),
    )
    .await
    .unwrap();
    assert_eq!(res["success"], true);

    // 4. Tag delete
    let res = git_actions::execute_action(
        root,
        &json!({ "action": "tag_delete", "name": "v1.0.0" }),
    )
    .await
    .unwrap();
    assert_eq!(res["success"], true);

    // 5. Raw command (safe)
    let res = git_actions::execute_action(
        root,
        &json!({ "action": "raw_command", "command": "git branch" }),
    )
    .await
    .unwrap();
    assert_eq!(res["success"], true);
    assert!(res["output"].as_str().unwrap().contains("development"));

    // 6. Branch delete
    git_cmd(root, &["checkout", "main"]);
    let res = git_actions::execute_action(
        root,
        &json!({ "action": "branch_delete", "name": "development", "force": true }),
    )
    .await
    .unwrap();
    assert_eq!(res["success"], true);
}
