use std::{path::Path, process::Command};
use worklens_runtime::{catalog, git, service::Service};

fn write(root: &Path, path: &str, text: &str) {
    let target = root.join(path);
    std::fs::create_dir_all(target.parent().unwrap()).unwrap();
    std::fs::write(target, text).unwrap();
}

#[tokio::test]
async fn workspace_patterns_exclude_archives_and_their_edges_even_from_cache() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    assert!(
        Command::new("git")
            .args(["init", "-q"])
            .current_dir(root)
            .status()
            .unwrap()
            .success()
    );
    write(root, "package.json", r#"{"name":"root"}"#);
    write(
        root,
        "apps/web/package.json",
        r#"{"name":"web","dependencies":{"shared":"workspace:*"}}"#,
    );
    write(root, "libs/shared/package.json", r#"{"name":"shared"}"#);
    write(
        root,
        "archive/web/package.json",
        r#"{"name":"old-web","dependencies":{"shared":"workspace:*","old-dep":"1"}}"#,
    );
    write(root, "apps/old/package.json", r#"{"name":"old"}"#);
    write(root, "pnpm-workspace.yaml", "packages: ['**']\n");
    let db = tempfile::tempdir().unwrap();
    let service = Service::new(&db.path().join("state.db")).unwrap();
    let repo = git::repository(root, false).await.unwrap();
    let before = service.graph(&repo, true).await.unwrap();
    assert!(before.nodes.iter().any(|n| n.name == "old-web"));

    // A later include cannot override an exclusion; braces select apps and libs.
    write(
        root,
        "pnpm-workspace.yaml",
        "packages:\n  - '!apps/old'\n  - './{apps,libs}/*'\n",
    );
    for graph in [
        service.graph(&repo, false).await.unwrap(),
        catalog::passive(root).await.unwrap(),
    ] {
        let names: Vec<_> = graph.nodes.iter().map(|node| node.name.as_str()).collect();
        assert_eq!(names.len(), 3, "{names:?}");
        assert!(names.contains(&"root") && names.contains(&"web") && names.contains(&"shared"));
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.edges[0].target, "package:libs/shared/package.json");
        assert!(graph.nodes.iter().all(|node| node.ecosystem == "pnpm"));
    }
    assert!(!root.join("node_modules").exists());
    assert!(!root.join("pnpm-lock.yaml").exists());
}

#[tokio::test]
async fn root_is_always_included_and_invalid_yaml_never_expands_scope() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    assert!(
        Command::new("git")
            .args(["init", "-q"])
            .current_dir(root)
            .status()
            .unwrap()
            .success()
    );
    write(root, "package.json", r#"{"name":"root"}"#);
    write(root, "archive/old/package.json", r#"{"name":"old"}"#);
    write(root, "pnpm-workspace.yaml", "packages: []\n");
    let graph = catalog::passive(root).await.unwrap();
    assert_eq!(graph.nodes.len(), 1);
    assert_eq!(graph.nodes[0].name, "root");
    write(root, "pnpm-workspace.yaml", "packages: not-a-list\n");
    assert!(catalog::passive(root).await.is_err());
    std::fs::remove_file(root.join("pnpm-workspace.yaml")).unwrap();
    let graph = catalog::passive(root).await.unwrap();
    assert!(
        graph
            .nodes
            .iter()
            .all(|node| node.ecosystem == "javascript")
    );
}
