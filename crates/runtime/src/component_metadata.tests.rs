use super::*;
use serde_json::json;

#[tokio::test]
async fn nx_affected_preserves_unknown_until_trusted_and_compares_resolved_commits() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    command::git(root, &["init", "-b", "main"]).await.unwrap();
    command::git(
        root,
        &[
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "--allow-empty",
            "-m",
            "fixture",
        ],
    )
    .await
    .unwrap();
    std::fs::create_dir_all(root.join("node_modules/nx")).unwrap();
    std::fs::write(
        root.join("node_modules/nx/package.json"),
        r#"{"bin":{"nx":"cli.js"}}"#,
    )
    .unwrap();
    std::fs::write(root.join("node_modules/nx/cli.js"), "require('fs').writeFileSync('invoked.json',JSON.stringify(process.argv.slice(2))); console.log(JSON.stringify(['sample']));").unwrap();
    let mut repo = Repository {
        id: "test".into(),
        name: "test".into(),
        path: root.to_string_lossy().into_owned(),
        common_dir: root.join(".git").to_string_lossy().into_owned(),
        trusted: false,
    };
    let projects = vec![Project {
        id: "nx:sample".into(),
        name: "sample".into(),
        root: String::new(),
        kind: "app".into(),
        ecosystem: "nx".into(),
        manifest: "package.json".into(),
        external: false,
        targets: vec![],
        features: vec![],
    }];
    let params = json!({"checkAffected":true,"base":"main","head":"HEAD"});
    let result = affected(&repo, &projects, &params).await;
    assert_eq!(result.affected, None);
    assert!(result.reason.contains("trust"));
    assert!(!root.join("invoked.json").exists());
    repo.trusted = true;
    let result = affected(&repo, &projects, &params).await;
    assert_eq!(result.affected, Some(true));
    assert_eq!(result.base.len(), 40);
    let args = std::fs::read_to_string(root.join("invoked.json")).unwrap();
    assert!(args.contains(&format!("--base={}", result.base)));
    let unknown = affected(
        &repo,
        &projects,
        &json!({"checkAffected":true,"base":"missing","head":"HEAD"}),
    )
    .await;
    assert_eq!(unknown.affected, None);
}
