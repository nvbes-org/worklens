use std::path::Path;
use tempfile::tempdir;
use worklens_runtime::{
    command::git,
    editor_service::{file_list, file_read, file_write},
    merge_service::{conflict_details, conflict_list, resolve_conflict},
};

async fn setup_git_repo(path: &Path) {
    git(path, &["init"]).await.unwrap();
    git(path, &["config", "user.name", "Test"]).await.unwrap();
    git(path, &["config", "user.email", "test@example.com"]).await.unwrap();
}

#[tokio::test]
async fn test_editor_file_read_write_and_list() {
    let dir = tempdir().unwrap();
    let root = dir.path();
    setup_git_repo(root).await;

    // Test writing a file
    file_write(root, "src/hello.rs", "fn main() {\n    println!(\"hello\");\n}")
        .await
        .unwrap();

    // Test reading the file
    let payload = file_read(root, "src/hello.rs").await.unwrap();
    assert_eq!(payload.path, "src/hello.rs");
    assert!(payload.content.contains("println!(\"hello\");"));
    assert_eq!(payload.size_bytes, payload.content.len() as u64);

    // Test path escape rejection
    assert!(file_read(root, "../outside.txt").await.is_err());
    assert!(file_write(root, "../outside.txt", "bad").await.is_err());

    // Add and commit to git
    git(root, &["add", "src/hello.rs"]).await.unwrap();
    git(root, &["commit", "-m", "initial commit"]).await.unwrap();

    // Test file listing
    let files = file_list(root).await.unwrap();
    assert!(files.contains(&"src/hello.rs".to_string()));
}

#[tokio::test]
async fn test_merge_conflict_detection_and_resolution() {
    let dir = tempdir().unwrap();
    let root = dir.path();
    setup_git_repo(root).await;

    // Base commit on main
    file_write(root, "file.txt", "initial line\n").await.unwrap();
    git(root, &["add", "file.txt"]).await.unwrap();
    git(root, &["commit", "-m", "base commit"]).await.unwrap();

    // Branch A
    git(root, &["checkout", "-b", "branch-a"]).await.unwrap();
    file_write(root, "file.txt", "branch A modification\n").await.unwrap();
    git(root, &["commit", "-am", "branch a change"]).await.unwrap();

    // Branch B
    git(root, &["checkout", "main"]).await.unwrap();
    git(root, &["checkout", "-b", "branch-b"]).await.unwrap();
    file_write(root, "file.txt", "branch B modification\n").await.unwrap();
    git(root, &["commit", "-am", "branch b change"]).await.unwrap();

    // Merge branch-a into branch-b to create a real git conflict
    let _ = git(root, &["merge", "branch-a"]).await;

    // Check conflict list
    let conflicts = conflict_list(root).await.unwrap();
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].path, "file.txt");
    assert!(conflicts[0].conflict_count >= 1);

    // Check conflict details
    let details = conflict_details(root, "file.txt").await.unwrap();
    assert_eq!(details.path, "file.txt");
    assert_eq!(details.hunks.len(), 1);
    assert!(details.hunks[0].current_content.contains("branch B"));
    assert!(details.hunks[0].incoming_content.contains("branch A"));

    // Resolve conflict
    let resolved = "resolved unified content\n";
    resolve_conflict(root, "file.txt", resolved).await.unwrap();

    // Verify file content on disk
    let read_back = file_read(root, "file.txt").await.unwrap();
    assert_eq!(read_back.content, resolved);

    // Conflicts list should now be empty (since it was git added)
    let post_conflicts = conflict_list(root).await.unwrap();
    assert_eq!(post_conflicts.len(), 0);
}
