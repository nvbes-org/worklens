use std::{path::Path, process::Command};
use worklens_core::Project;
use worklens_runtime::component_metadata;

fn git(root: &Path, args: &[&str]) -> String {
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
    String::from_utf8(output.stdout).unwrap()
}
fn node(id: &str, external: bool) -> Project {
    Project {
        id: id.into(),
        name: "sample".into(),
        root: if external { "" } else { "apps/sample" }.into(),
        ecosystem: if external { "npm" } else { "nx" }.into(),
        manifest: "apps/sample/package.json".into(),
        kind: "app".into(),
        external,
        targets: vec![],
        features: vec![],
    }
}
#[tokio::test]
async fn collects_size_git_history_and_manifest_hash_without_counting_build_outputs() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main"]);
    git(root, &["config", "user.name", "Test"]);
    git(root, &["config", "user.email", "test@example.invalid"]);
    std::fs::create_dir_all(root.join("apps/sample/dist")).unwrap();
    std::fs::write(
        root.join("apps/sample/package.json"),
        r#"{"name":"sample"}"#,
    )
    .unwrap();
    std::fs::write(root.join("apps/sample/dist/bundle.js"), "build output").unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "Add sample"]);
    std::fs::write(root.join("apps/sample/source.ts"), "source").unwrap();
    let report = component_metadata::inspect(root, &[node("nx:sample", false)])
        .await
        .unwrap();
    assert_eq!(report.file_count, Some(2));
    assert_eq!(report.size_bytes, Some(23));
    assert_eq!(report.dirty, Some(true));
    assert_eq!(report.last_commit.unwrap().subject, "Add sample");
    assert!(report.first_commit_at.is_some() && report.modified_at.is_some());
    assert_eq!(report.integrity[0].algorithm, "sha256");
    assert_eq!(report.integrity[0].value.len(), 64);
}
#[tokio::test]
async fn exact_lock_integrity_is_not_a_local_size_or_verified_archive() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("pnpm-lock.yaml"),
        "packages:\n  sample@1.2.3:\n    resolution:\n      integrity: sha512-example\n",
    )
    .unwrap();
    let report =
        component_metadata::inspect(dir.path(), &[node("npm-resolved:sample@1.2.3", true)])
            .await
            .unwrap();
    assert_eq!(report.integrity[0].value, "sha512-example");
    assert!(report.integrity[0].scope.contains("not verified"));
    assert_eq!(report.size_bytes, None);
    let range = component_metadata::inspect(dir.path(), &[node("npm:sample@^1", true)])
        .await
        .unwrap();
    assert!(range.integrity.is_empty());
}
