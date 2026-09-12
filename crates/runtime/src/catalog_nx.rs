use crate::{Result, command, error};
use serde_json::Value;
use std::path::Path;
use worklens_core::*;

pub async fn collect(root: &Path) -> Result<Graph> {
    let entry = executable(root)?;
    let output = command::run(root, "node", &[&entry, "graph", "--print"]).await?;
    let mut graph = parse(&serde_json::from_slice(&output)?)?;
    for node in &mut graph.nodes {
        let directory = root.join(&node.root);
        if !directory.join("package.json").is_file() {
            let name = if directory.join("Cargo.toml").is_file() {
                "Cargo.toml"
            } else {
                "project.json"
            };
            node.manifest = Path::new(&node.root)
                .join(name)
                .to_string_lossy()
                .into_owned();
        }
    }
    Ok(graph)
}

pub fn parse(json: &Value) -> Result<Graph> {
    let value = json.get("graph").unwrap_or(json);
    let nodes = value["nodes"]
        .as_object()
        .ok_or_else(|| error("Nx output missing graph.nodes"))?;
    let mut graph = Graph {
        components: vec![],
        nodes: vec![],
        edges: vec![],
        sources: vec![Provenance::observed("local Nx graph --print")],
    };
    for (name, node) in nodes {
        let data = &node["data"];
        let root = data["root"].as_str().unwrap_or("");
        graph.nodes.push(Project {
            id: format!("nx:{name}"),
            name: name.clone(),
            root: root.into(),
            kind: node["type"].as_str().unwrap_or("project").into(),
            ecosystem: "nx".into(),
            manifest: if root.is_empty() || root == "." {
                "package.json".into()
            } else {
                format!("{root}/package.json")
            },
            external: false,
            targets: data["targets"]
                .as_object()
                .map(|t| t.keys().cloned().collect())
                .unwrap_or_default(),
            features: vec![],
        });
    }
    if let Some(groups) = value["dependencies"].as_object() {
        for deps in groups.values().filter_map(Value::as_array) {
            for dep in deps {
                let source = format!("nx:{}", dep["source"].as_str().unwrap_or(""));
                let target = format!("nx:{}", dep["target"].as_str().unwrap_or(""));
                if graph.nodes.iter().any(|n| n.id == target) {
                    graph.edges.push(Edge {
                        source,
                        target,
                        kind: RelationKind::ProjectDependency,
                        evidence: Evidence::Observed,
                        origin: format!("nx graph: {}", dep["type"]),
                    });
                }
            }
        }
    }
    Ok(graph)
}

pub async fn tasks(root: &Path, project: &str, target: &str) -> Result<Value> {
    if [project, target]
        .iter()
        .any(|s| s.is_empty() || s.starts_with('-') || s.contains(':'))
    {
        return Err(error("Invalid project or target"));
    }
    let spec = format!("{project}:{target}");
    let entry = executable(root)?;
    let output = command::run(root, "node", &[&entry, "run", &spec, "--graph=stdout"]).await?;
    Ok(serde_json::from_slice(&output)?)
}

fn executable(root: &Path) -> Result<String> {
    let package = root
        .join("node_modules/nx")
        .canonicalize()
        .map_err(|_| error("Local Nx is not installed; Worklens will not install it"))?;
    let manifest: Value = serde_json::from_str(&crate::paths::read_bounded(
        &package.join("package.json"),
        1_000_000,
    )?)?;
    let bin = manifest["bin"]["nx"]
        .as_str()
        .or_else(|| manifest["bin"].as_str())
        .ok_or_else(|| error("Nx package does not declare its CLI entry point"))?;
    Ok(crate::paths::confined(&package, bin)?
        .to_string_lossy()
        .into_owned())
}
