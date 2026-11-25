use serde_json::json;
use std::{path::Path, process::Command};
use tempfile::TempDir;
use worklens_core::{MultiRepoStatus, MultiRepoWorkspace, Operation, PROTOCOL_VERSION, Request, WorkspaceRepoEntry};
use worklens_runtime::service::Service;

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
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
}

fn create_repo(name: &str) -> TempDir {
    let dir = tempfile::Builder::new()
        .prefix(&format!("worklens_mr_{name}_"))
        .tempdir()
        .unwrap();
    git_cmd(dir.path(), &["init", "-b", "main"]);
    git_cmd(dir.path(), &["config", "user.name", "Worklens Test"]);
    git_cmd(dir.path(), &["config", "user.email", "test@example.invalid"]);
    std::fs::write(dir.path().join("README.md"), format!("# {}\n", name)).unwrap();
    git_cmd(dir.path(), &["add", "."]);
    git_cmd(dir.path(), &["commit", "-m", "initial commit"]);
    dir
}

#[tokio::test]
async fn test_multi_repo_workspace_lifecycle() {
    let db_dir = tempfile::TempDir::new().unwrap();
    let service = Service::new(&db_dir.path().join("state.db")).unwrap();

    let repo1 = create_repo("service_a");
    let repo2 = create_repo("service_b");

    let workspace = MultiRepoWorkspace {
        id: "ws-microservices".into(),
        name: "Microservices Suite".into(),
        description: Some("Backend and frontend services".into()),
        repos: vec![
            WorkspaceRepoEntry {
                id: "repo-a".into(),
                name: "service-a".into(),
                path: repo1.path().to_string_lossy().into_owned(),
                remote_url: None,
                default_branch: Some("main".into()),
            },
            WorkspaceRepoEntry {
                id: "repo-b".into(),
                name: "service-b".into(),
                path: repo2.path().to_string_lossy().into_owned(),
                remote_url: None,
                default_branch: Some("main".into()),
            },
        ],
        created_at: "2026-10-21T00:00:00Z".into(),
        updated_at: "2026-10-21T00:00:00Z".into(),
    };

    // 1. Save workspace
    let save_req = Request {
        version: PROTOCOL_VERSION,
        operation: Operation::MultiRepoSave,
        repository: None,
        params: json!(workspace),
    };
    let res = service.request(save_req).await;
    assert!(res.error.is_none(), "Save error: {:?}", res.error);

    // 2. List workspaces
    let list_req = Request {
        version: PROTOCOL_VERSION,
        operation: Operation::MultiRepoList,
        repository: None,
        params: json!({}),
    };
    let res = service.request(list_req).await;
    assert!(res.error.is_none());
    let list: Vec<MultiRepoWorkspace> = serde_json::from_value(res.data).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, "ws-microservices");
    assert_eq!(list[0].repos.len(), 2);

    // 3. Get workspace
    let get_req = Request {
        version: PROTOCOL_VERSION,
        operation: Operation::MultiRepoGet,
        repository: None,
        params: json!({ "id": "ws-microservices" }),
    };
    let res = service.request(get_req.clone()).await;
    assert!(res.error.is_none());
    let ws: MultiRepoWorkspace = serde_json::from_value(res.data).unwrap();
    assert_eq!(ws.name, "Microservices Suite");

    // 4. Delete workspace
    let del_req = Request {
        version: PROTOCOL_VERSION,
        operation: Operation::MultiRepoDelete,
        repository: None,
        params: json!({ "id": "ws-microservices" }),
    };
    let res = service.request(del_req).await;
    assert!(res.error.is_none());

    // 5. Verify deleted
    let res = service.request(get_req).await;
    assert!(res.error.is_some());
}

#[tokio::test]
async fn test_multi_repo_status_and_detection() {
    let db_dir = tempfile::TempDir::new().unwrap();
    let service = Service::new(&db_dir.path().join("state.db")).unwrap();

    // Repo 1: Clean
    let repo_clean = create_repo("clean_service");

    // Repo 2: Dirty (untracked and modified files)
    let repo_dirty = create_repo("dirty_service");
    std::fs::write(repo_dirty.path().join("dirty.txt"), "uncommitted work\n").unwrap();

    // Repo 3: Ahead of upstream remote
    let upstream_bare = tempfile::Builder::new()
        .prefix("upstream_bare_")
        .tempdir()
        .unwrap();
    git_cmd(upstream_bare.path(), &["init", "--bare", "-b", "main"]);

    let repo_ahead = create_repo("ahead_service");
    git_cmd(
        repo_ahead.path(),
        &["remote", "add", "origin", &upstream_bare.path().to_string_lossy()],
    );
    git_cmd(repo_ahead.path(), &["push", "-u", "origin", "main"]);
    // Make a commit locally so it is 1 ahead
    std::fs::write(repo_ahead.path().join("new_feature.txt"), "feature\n").unwrap();
    git_cmd(repo_ahead.path(), &["add", "."]);
    git_cmd(repo_ahead.path(), &["commit", "-m", "local commit ahead"]);

    // Missing repo path
    let missing_path = db_dir.path().join("non_existent_folder");

    let workspace = MultiRepoWorkspace {
        id: "ws-detection".into(),
        name: "Detection Test Workspace".into(),
        description: None,
        repos: vec![
            WorkspaceRepoEntry {
                id: "r1".into(),
                name: "clean-repo".into(),
                path: repo_clean.path().to_string_lossy().into_owned(),
                remote_url: None,
                default_branch: Some("main".into()),
            },
            WorkspaceRepoEntry {
                id: "r2".into(),
                name: "dirty-repo".into(),
                path: repo_dirty.path().to_string_lossy().into_owned(),
                remote_url: None,
                default_branch: Some("main".into()),
            },
            WorkspaceRepoEntry {
                id: "r3".into(),
                name: "ahead-repo".into(),
                path: repo_ahead.path().to_string_lossy().into_owned(),
                remote_url: None,
                default_branch: Some("main".into()),
            },
            WorkspaceRepoEntry {
                id: "r4".into(),
                name: "missing-repo".into(),
                path: missing_path.to_string_lossy().into_owned(),
                remote_url: Some("https://github.com/example/missing.git".into()),
                default_branch: Some("main".into()),
            },
        ],
        created_at: "2026-10-21T00:00:00Z".into(),
        updated_at: "2026-10-21T00:00:00Z".into(),
    };

    service.db().unwrap().save_multi_workspace(&workspace).unwrap();

    let status_req = Request {
        version: PROTOCOL_VERSION,
        operation: Operation::MultiRepoStatus,
        repository: None,
        params: json!({ "id": "ws-detection" }),
    };
    let res = service.request(status_req).await;
    assert!(res.error.is_none(), "Status error: {:?}", res.error);

    let status: MultiRepoStatus = serde_json::from_value(res.data).unwrap();
    assert_eq!(status.total_repos, 4);
    assert_eq!(status.clean_repos, 1);
    assert_eq!(status.dirty_repos, 1);
    assert_eq!(status.ahead_repos, 1);
    assert_eq!(status.missing_repos, 1);

    // Verify per-repo specifics
    let dirty_r = status.repos.iter().find(|r| r.name == "dirty-repo").unwrap();
    assert!(dirty_r.is_dirty);
    assert_eq!(dirty_r.untracked_count, 1);

    let ahead_r = status.repos.iter().find(|r| r.name == "ahead-repo").unwrap();
    assert_eq!(ahead_r.ahead, 1);
    assert_eq!(ahead_r.behind, 0);

    let missing_r = status.repos.iter().find(|r| r.name == "missing-repo").unwrap();
    assert!(!missing_r.exists);
}

#[tokio::test]
async fn test_multi_repo_batch_actions() {
    let db_dir = tempfile::TempDir::new().unwrap();
    let service = Service::new(&db_dir.path().join("state.db")).unwrap();

    let repo1 = create_repo("batch1");
    let repo2 = create_repo("batch2");

    // Make repo2 dirty
    std::fs::write(repo2.path().join("dirty.txt"), "dirty work\n").unwrap();

    let workspace = MultiRepoWorkspace {
        id: "ws-batch".into(),
        name: "Batch Workspace".into(),
        description: None,
        repos: vec![
            WorkspaceRepoEntry {
                id: "b1".into(),
                name: "b1".into(),
                path: repo1.path().to_string_lossy().into_owned(),
                remote_url: None,
                default_branch: Some("main".into()),
            },
            WorkspaceRepoEntry {
                id: "b2".into(),
                name: "b2".into(),
                path: repo2.path().to_string_lossy().into_owned(),
                remote_url: None,
                default_branch: Some("main".into()),
            },
        ],
        created_at: "2026-10-21T00:00:00Z".into(),
        updated_at: "2026-10-21T00:00:00Z".into(),
    };

    service.db().unwrap().save_multi_workspace(&workspace).unwrap();

    // 1. Batch Fetch
    let fetch_req = Request {
        version: PROTOCOL_VERSION,
        operation: Operation::MultiRepoBatch,
        repository: None,
        params: json!({ "id": "ws-batch", "action": "fetch" }),
    };
    let res = service.request(fetch_req).await;
    assert!(res.error.is_none());

    // 2. Batch Pull: repo2 must be skipped safely due to dirty state
    let pull_req = Request {
        version: PROTOCOL_VERSION,
        operation: Operation::MultiRepoBatch,
        repository: None,
        params: json!({ "id": "ws-batch", "action": "pull" }),
    };
    let res = service.request(pull_req).await;
    assert!(res.error.is_none());
    let report: worklens_core::BatchReport = serde_json::from_value(res.data).unwrap();
    let r2_res = report.results.iter().find(|r| r.repo_name == "b2").unwrap();
    assert!(!r2_res.success);
    assert!(r2_res.message.contains("uncommitted"));
}
