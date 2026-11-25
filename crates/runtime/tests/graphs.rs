use serde_json::json;
use worklens_runtime::{catalog_cargo, catalog_nx, github};

#[test]
fn cargo_preserves_features_and_dependency_provenance() {
    let graph = catalog_cargo::parse(std::path::Path::new("/repo"), &json!({
        "workspace_members":["a"],
        "packages":[{"id":"a","name":"app","manifest_path":"/repo/Cargo.toml"},{"id":"b","name":"external","manifest_path":"/cache/b/Cargo.toml"}],
        "resolve":{"nodes":[{"id":"a","features":["default","tls"],"deps":[{"pkg":"b","dep_kinds":[{"kind":"build","target":"cfg(unix)"}]}]}]}
    })).unwrap();
    assert_eq!(graph.nodes[0].features, vec!["default", "tls"]);
    assert!(graph.nodes[1].external);
    assert!(graph.edges[0].origin.contains("build"));
}

#[test]
fn impact_terminates_on_cycles_and_respects_directory_boundaries() {
    let graph = catalog_nx::parse(&json!({"graph":{
        "nodes":{"a":{"data":{"root":"libs/a"}},"b":{"data":{"root":"libs/b"}},"abc":{"data":{"root":"libs/abc"}}},
        "dependencies":{"a":[{"source":"a","target":"b"}],"b":[{"source":"b","target":"a"}]}
    }})).unwrap();
    let impact = worklens_core::impact(&graph, &["libs/a/src/file.rs".into()]);
    assert_eq!(impact.direct, vec!["nx:a"]);
    assert_eq!(impact.dependants, vec!["nx:b"]);
}

#[test]
fn github_remote_identity_and_path_validation() {
    assert_eq!(
        github::slug("git@github.com:owner/repo.git").as_deref(),
        Some("owner/repo")
    );
    assert_eq!(
        github::slug("https://github.com/fork/repo").as_deref(),
        Some("fork/repo")
    );
    assert!(github::slug("https://github.com.attacker.invalid/owner/repo").is_none());
    for slug in ["../repo", "owner/..", "owner/repo?x", "owner/repo/extra"] {
        assert!(!github::valid_slug(slug));
    }
}

#[tokio::test]
async fn cargo_offline_fallback_preserves_members_without_installing_or_lockfiles() {
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("src")).unwrap();
    std::fs::write(root.path().join("src/lib.rs"), "pub fn value() {}\n").unwrap();
    std::fs::write(root.path().join("Cargo.toml"), "[package]\nname='offline-fixture'\nversion='0.1.0'\nedition='2024'\n[dependencies]\nworklens-nonexistent-fixture='999'\n").unwrap();
    let graph = catalog_cargo::collect(root.path()).await.unwrap();
    assert_eq!(graph.nodes.len(), 1);
    assert_eq!(graph.nodes[0].name, "offline-fixture");
    assert!(graph.edges.is_empty());
    assert_eq!(
        graph.sources[0].status,
        worklens_core::Availability::Partial
    );
    assert!(!root.path().join("Cargo.lock").exists());
    assert!(!root.path().join("target").exists());
}
