use serde_json::json;
use std::{path::Path, process::Command};
use tempfile::TempDir;
use worklens_runtime::git_actions;

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
        .prefix("worklens_adv_git_")
        .tempdir()
        .unwrap();
    git_cmd(dir.path(), &["init", "-b", "main"]);
    git_cmd(dir.path(), &["config", "user.name", "Worklens Adv"]);
    git_cmd(
        dir.path(),
        &["config", "user.email", "adv@example.invalid"],
    );
    dir
}

#[tokio::test]
async fn test_stash_management() {
    let dir = fixture();
    let root = dir.path();

    std::fs::write(root.join("initial.txt"), "hello\n").unwrap();
    git_cmd(root, &["add", "."]);
    git_cmd(root, &["commit", "-m", "initial commit"]);

    std::fs::write(root.join("wip.txt"), "work in progress\n").unwrap();

    // 1. Create named stash including untracked
    let res = git_actions::execute_action(
        root,
        &json!({
            "action": "stash_create",
            "message": "my WIP feature",
            "include_untracked": true,
            "keep_index": false
        }),
    )
    .await
    .unwrap();
    assert_eq!(res["success"], true);

    // 2. List stashes
    let list_res = git_actions::execute_action(root, &json!({ "action": "stash_list" }))
        .await
        .unwrap();
    let stashes: Vec<worklens_core::StashEntry> = serde_json::from_value(list_res).unwrap();
    assert_eq!(stashes.len(), 1);
    assert_eq!(stashes[0].selector, "stash@{0}");
    assert!(stashes[0].message.contains("my WIP feature"));

    // 3. Show stash preview
    let show_res = git_actions::execute_action(
        root,
        &json!({ "action": "stash_show", "selector": "stash@{0}" }),
    )
    .await
    .unwrap();
    assert!(show_res["diff"].as_str().unwrap().contains("work in progress"));
    let files: Vec<String> = serde_json::from_value(show_res["files"].clone()).unwrap();
    assert!(files.contains(&"wip.txt".to_string()));

    // 4. Pop stash
    let pop_res = git_actions::execute_action(
        root,
        &json!({ "action": "stash_pop", "selector": "stash@{0}" }),
    )
    .await
    .unwrap();
    assert_eq!(pop_res["success"], true);
    assert!(root.join("wip.txt").exists());

    // 5. Verify stash list is empty
    let list_after = git_actions::execute_action(root, &json!({ "action": "stash_list" }))
        .await
        .unwrap();
    let stashes_after: Vec<worklens_core::StashEntry> = serde_json::from_value(list_after).unwrap();
    assert_eq!(stashes_after.len(), 0);
}

#[tokio::test]
async fn test_cherry_pick() {
    let dir = fixture();
    let root = dir.path();

    std::fs::write(root.join("main.txt"), "main branch\n").unwrap();
    git_cmd(root, &["add", "."]);
    git_cmd(root, &["commit", "-m", "main init"]);

    // Create feature branch with commit
    git_cmd(root, &["checkout", "-b", "feature-x"]);
    std::fs::write(root.join("feat.txt"), "feature data\n").unwrap();
    git_cmd(root, &["add", "."]);
    git_cmd(root, &["commit", "-m", "feature commit to pick"]);

    // Get feature commit SHA
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(root)
        .output()
        .unwrap();
    let feat_sha = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Switch to main
    git_cmd(root, &["checkout", "main"]);
    assert!(!root.join("feat.txt").exists());

    // Cherry-pick feature commit onto main
    let res = git_actions::execute_action(
        root,
        &json!({
            "action": "cherry_pick",
            "sha": feat_sha,
            "no_commit": false
        }),
    )
    .await
    .unwrap();
    assert_eq!(res["success"], true);
    assert!(root.join("feat.txt").exists());

    // Verify commit in log
    let log_out = Command::new("git")
        .args(["log", "-1", "--format=%s"])
        .current_dir(root)
        .output()
        .unwrap();
    assert_eq!(
        String::from_utf8_lossy(&log_out.stdout).trim(),
        "feature commit to pick"
    );
}

#[tokio::test]
async fn test_worktree_lifecycle() {
    let dir = fixture();
    let root = dir.path();

    std::fs::write(root.join("file.txt"), "data\n").unwrap();
    git_cmd(root, &["add", "."]);
    git_cmd(root, &["commit", "-m", "initial"]);

    let wt_dir = tempfile::tempdir().unwrap();
    let wt_path = wt_dir.path().to_string_lossy().to_string();

    // 1. Add worktree on new branch
    let add_res = git_actions::execute_action(
        root,
        &json!({
            "action": "worktree_add",
            "path": wt_path,
            "new_branch": "wt-branch"
        }),
    )
    .await
    .unwrap();
    assert_eq!(add_res["success"], true);
    assert!(wt_dir.path().join("file.txt").exists());

    // 2. Lock worktree
    let lock_res = git_actions::execute_action(
        root,
        &json!({
            "action": "worktree_lock",
            "path": wt_path,
            "reason": "testing lock"
        }),
    )
    .await
    .unwrap();
    assert_eq!(lock_res["success"], true);

    // 3. Unlock worktree
    let unlock_res = git_actions::execute_action(
        root,
        &json!({
            "action": "worktree_unlock",
            "path": wt_path
        }),
    )
    .await
    .unwrap();
    assert_eq!(unlock_res["success"], true);

    // 4. Remove worktree
    let rm_res = git_actions::execute_action(
        root,
        &json!({
            "action": "worktree_remove",
            "path": wt_path,
            "force": true
        }),
    )
    .await
    .unwrap();
    assert_eq!(rm_res["success"], true);
}

#[tokio::test]
async fn test_lfs_pattern_tracking_and_scan() {
    let dir = fixture();
    let root = dir.path();

    // 1. Track pattern
    let track_res = git_actions::execute_action(
        root,
        &json!({
            "action": "lfs_track",
            "pattern": "*.weights"
        }),
    )
    .await
    .unwrap();
    assert_eq!(track_res["success"], true);

    // Verify .gitattributes
    let attrs = std::fs::read_to_string(root.join(".gitattributes")).unwrap();
    assert!(attrs.contains("filter=lfs"));
    assert!(attrs.contains("*.weights"));

    // 2. Scan for large files
    let binary_file = root.join("model.onnx");
    let content = vec![0u8; 600 * 1024]; // 600 KB
    std::fs::write(&binary_file, content).unwrap();

    let scan_res = git_actions::execute_action(
        root,
        &json!({
            "action": "lfs_scan_large_files",
            "threshold_mb": 1
        }),
    )
    .await
    .unwrap();
    let candidates: Vec<worklens_core::LargeFileCandidate> =
        serde_json::from_value(scan_res).unwrap();
    assert!(candidates.iter().any(|c| c.path == "model.onnx"));

    // 3. Untrack pattern
    let untrack_res = git_actions::execute_action(
        root,
        &json!({
            "action": "lfs_untrack",
            "pattern": "*.weights"
        }),
    )
    .await
    .unwrap();
    assert_eq!(untrack_res["success"], true);
}

#[tokio::test]
async fn test_rebase_status_and_commits() {
    let dir = fixture();
    let root = dir.path();

    std::fs::write(root.join("base.txt"), "base\n").unwrap();
    git_cmd(root, &["add", "."]);
    git_cmd(root, &["commit", "-m", "commit 1"]);

    std::fs::write(root.join("file2.txt"), "file2\n").unwrap();
    git_cmd(root, &["add", "."]);
    git_cmd(root, &["commit", "-m", "commit 2"]);

    // Check status when not in progress
    let status_res = git_actions::execute_action(root, &json!({ "action": "rebase_status" }))
        .await
        .unwrap();
    let status: worklens_core::RebaseStatus = serde_json::from_value(status_res).unwrap();
    assert_eq!(status.in_progress, false);

    // List commits from HEAD~1
    let commits_res = git_actions::execute_action(
        root,
        &json!({
            "action": "rebase_commits",
            "upstream": "HEAD~1"
        }),
    )
    .await
    .unwrap();
    let items: Vec<worklens_core::RebaseItem> = serde_json::from_value(commits_res).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].subject, "commit 2");
    assert_eq!(items[0].action, "pick");
}

#[tokio::test]
async fn test_signing_config_and_ssh() {
    let dir = fixture();
    let root = dir.path();
    git_cmd(root, &["config", "commit.gpgsign", "false"]);

    // 1. Initial status
    let status_res = git_actions::execute_action(root, &json!({ "action": "signing_status" }))
        .await
        .unwrap();
    let status: worklens_core::SigningStatus = serde_json::from_value(status_res).unwrap();
    assert_eq!(status.gpg_sign, false);

    // 2. Update config to SSH signing
    let cfg_res = git_actions::execute_action(
        root,
        &json!({
            "action": "signing_config",
            "gpg_sign": true,
            "format": "ssh",
            "signing_key": "id_test_signing.pub"
        }),
    )
    .await
    .unwrap();
    assert_eq!(cfg_res["success"], true);

    // 3. Verify status updated
    let updated_res = git_actions::execute_action(root, &json!({ "action": "signing_status" }))
        .await
        .unwrap();
    let updated: worklens_core::SigningStatus = serde_json::from_value(updated_res).unwrap();
    assert_eq!(updated.gpg_sign, true);
    assert_eq!(updated.format, "ssh");
    assert_eq!(updated.signing_key, Some("id_test_signing.pub".to_string()));

    // 4. SSH key generate
    let gen_res = git_actions::execute_action(
        root,
        &json!({
            "action": "ssh_key_generate",
            "name": format!("test_key_{}", std::process::id()),
            "email": "test@worklens.dev",
            "key_type": "ed25519",
            "set_as_signing": false
        }),
    )
    .await
    .unwrap();
    assert_eq!(gen_res["success"], true);
    assert!(gen_res["publicKey"].as_str().unwrap().starts_with("ssh-ed25519"));
}
