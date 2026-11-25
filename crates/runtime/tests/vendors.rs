use std::path::Path;
use worklens_core::{Availability, Evidence, Graph};
use worklens_runtime::catalog_vendors;

fn write(root: &Path, path: &str, text: &str) {
    let target = root.join(path);
    std::fs::create_dir_all(target.parent().unwrap()).unwrap();
    std::fs::write(target, text).unwrap();
}

#[test]
fn parses_vendor_manifests_without_running_scripts_or_following_symlinks() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write(
        root,
        "vendor/js/package.json",
        r#"{"name":"vendor-js","scripts":{"install":"touch SHOULD_NOT_EXIST"},"dependencies":{"react":"^19"}}"#,
    );
    write(
        root,
        "libs/vendors/rust/Cargo.toml",
        "[package]\nname='vendor-rust'\nversion='1.0.0'\n[dependencies]\nserde='1'\n",
    );
    write(root, "archive/vendor/old/package.json", r#"{"name":"old"}"#);
    write(
        root,
        "node_modules/vendor/generated/package.json",
        r#"{"name":"generated"}"#,
    );
    write(root, "vendor/broken/package.json", "invalid");
    write(root, ".gitignore", "vendor/\n");
    let outside = tempfile::tempdir().unwrap();
    write(outside.path(), "package.json", r#"{"name":"outside"}"#);
    std::os::unix::fs::symlink(outside.path(), root.join("vendor/escape")).unwrap();
    let mut graph = Graph {
        nodes: vec![],
        edges: vec![],
        sources: vec![],
        components: vec![],
    };
    catalog_vendors::extend(root, &mut graph).unwrap();
    assert_eq!(graph.nodes.len(), 4);
    assert_eq!(
        graph
            .nodes
            .iter()
            .filter(|node| node.kind == "vendor")
            .count(),
        2
    );
    assert!(
        graph
            .nodes
            .iter()
            .all(|node| node.external && node.targets.is_empty())
    );
    assert_eq!(graph.edges.len(), 2);
    assert!(
        graph
            .edges
            .iter()
            .all(|edge| matches!(edge.evidence, Evidence::Declared))
    );
    assert_eq!(graph.sources[0].status, Availability::Partial);
    assert!(!root.join("SHOULD_NOT_EXIST").exists());
}
