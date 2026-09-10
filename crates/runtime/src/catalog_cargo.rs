use crate::{Result, command, error};
use serde_json::Value;
use std::path::Path;
use worklens_core::*;

pub async fn collect(root: &Path) -> Result<Graph> {
    let result = command::run(
        root,
        "cargo",
        &["metadata", "--format-version", "1", "--locked", "--offline"],
    )
    .await;
    match result {
        Ok(bytes) => parse(root, &serde_json::from_slice(&bytes)?),
        Err(failure) => {
            let bytes = command::run(
                root,
                "cargo",
                &[
                    "metadata",
                    "--format-version",
                    "1",
                    "--locked",
                    "--offline",
                    "--no-deps",
                ],
            )
            .await?;
            let mut graph = parse(root, &serde_json::from_slice(&bytes)?)?;
            for source in &mut graph.sources {
                source.status = Availability::Partial;
                source.source = "cargo metadata --no-deps --locked --offline".into();
                source.detail = Some(format!(
                    "Workspace members only; dependency resolution unavailable: {failure}"
                ));
            }
            Ok(graph)
        }
    }
}

pub fn parse(root: &Path, value: &Value) -> Result<Graph> {
    let packages = value["packages"]
        .as_array()
        .ok_or_else(|| error("cargo metadata missing packages"))?;
    let members = value["workspace_members"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut graph = Graph {
        nodes: vec![],
        edges: vec![],
        sources: vec![Provenance::observed(
            "cargo metadata --locked --offline (default features; all target configurations)",
        )],
    };
    for package in packages {
        let Some(id) = package["id"].as_str() else {
            continue;
        };
        let external = !members.iter().any(|m| m.as_str() == Some(id));
        let manifest = Path::new(package["manifest_path"].as_str().unwrap_or(""));
        let relative = manifest
            .strip_prefix(root)
            .unwrap_or(manifest)
            .to_string_lossy()
            .into_owned();
        let features = value["resolve"]["nodes"]
            .as_array()
            .and_then(|nodes| nodes.iter().find(|n| n["id"].as_str() == Some(id)))
            .and_then(|n| n["features"].as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default();
        graph.nodes.push(Project {
            id: format!("cargo:{id}"),
            name: package["name"].as_str().unwrap_or(id).into(),
            root: if external {
                String::new()
            } else {
                Path::new(&relative)
                    .parent()
                    .unwrap_or(Path::new(""))
                    .to_string_lossy()
                    .into_owned()
            },
            kind: "crate".into(),
            ecosystem: "cargo".into(),
            manifest: relative,
            external,
            targets: if external {
                vec![]
            } else {
                vec!["check".into(), "test".into(), "build".into(), "doc".into()]
            },
            features,
        });
    }
    if let Some(nodes) = value["resolve"]["nodes"].as_array() {
        for node in nodes {
            if let Some(deps) = node["deps"].as_array() {
                for dependency in deps {
                    graph.edges.push(Edge {
                        source: format!("cargo:{}", node["id"].as_str().unwrap_or("")),
                        target: format!("cargo:{}", dependency["pkg"].as_str().unwrap_or("")),
                        kind: RelationKind::PackageDependency,
                        evidence: Evidence::Observed,
                        origin: format!(
                            "cargo metadata resolve; kinds={}",
                            dependency["dep_kinds"]
                        ),
                    });
                }
            }
        }
    }
    Ok(graph)
}
