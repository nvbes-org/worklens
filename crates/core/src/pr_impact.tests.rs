use super::*;
use crate::{Evidence, RelationKind};

fn project(id: &str) -> Project {
    Project {
        id: id.into(),
        name: id.into(),
        root: format!("libs/{id}"),
        kind: "lib".into(),
        ecosystem: "nx".into(),
        manifest: format!("libs/{id}/project.json"),
        external: false,
        targets: vec![],
        features: vec![],
    }
}
fn edge(source: &str, target: &str, kind: RelationKind) -> Edge {
    Edge {
        source: source.into(),
        target: target.into(),
        kind,
        evidence: Evidence::Declared,
        origin: "fixture manifest".into(),
    }
}

#[test]
fn rename_impacts_both_roots_and_explains_transitive_cycles() {
    let graph = Graph {
        nodes: vec![
            project("old"),
            project("new"),
            project("consumer"),
            project("upper"),
            project("task"),
        ],
        edges: vec![
            edge("consumer", "old", RelationKind::ProjectDependency),
            edge("upper", "consumer", RelationKind::PackageDependency),
            edge("consumer", "upper", RelationKind::ProjectDependency),
            edge("task", "old", RelationKind::TaskDependency),
        ],
        sources: vec![],
    };
    let impact = detailed_impact(
        &graph,
        &[PrChangedFile {
            path: "libs/new/file.rs".into(),
            previous_path: Some("libs/old/file.rs".into()),
            status: "renamed".into(),
        }],
    );
    assert_eq!(impact.direct.len(), 2);
    assert_eq!(impact.dependants.len(), 2);
    assert_eq!(impact.dependants[0].via.origin, "fixture manifest");
    assert_eq!(impact.direct[0].paths, vec!["libs/old/file.rs"]);
    assert!(impact.unmatched.is_empty());
}

#[test]
fn reports_unmatched_transversal_deleted_files_without_prefix_collisions() {
    let graph = Graph {
        nodes: vec![project("core")],
        edges: vec![],
        sources: vec![],
    };
    let files = [
        "libs/core/deleted.rs",
        "libs/core-other/file.rs",
        "Cargo.lock",
        ".github/workflows/ci.yml",
    ]
    .map(|path| PrChangedFile {
        path: path.into(),
        previous_path: None,
        status: "removed".into(),
    });
    let impact = detailed_impact(&graph, &files);
    assert_eq!(impact.direct[0].paths, vec!["libs/core/deleted.rs"]);
    assert_eq!(impact.unmatched.len(), 3);
    assert_eq!(impact.transversal.len(), 2);
}
