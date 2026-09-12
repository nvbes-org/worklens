use crate::{Result, command, paths};
use serde_json::Value;
use std::{collections::BTreeMap, path::Path};
use worklens_core::*;

pub async fn collect(repo: &Repository) -> Result<Graph> {
    let root = Path::new(&repo.path);
    let mut graph = passive(root).await?;
    if root.join("Cargo.toml").exists() {
        match crate::catalog_cargo::collect(root).await {
            Ok(cargo) => merge(&mut graph, cargo),
            Err(e) => graph.sources.push(Provenance::unavailable(
                "cargo metadata --locked --offline",
                &e.to_string(),
            )),
        }
    }
    if root.join("nx.json").exists() {
        if repo.trusted {
            match crate::catalog_nx::collect(root).await {
                Ok(nx) => merge(&mut graph, nx),
                Err(e) => graph
                    .sources
                    .push(Provenance::unavailable("nx", &e.to_string())),
            }
        } else {
            graph.sources.push(Provenance::unavailable(
                "nx",
                "Trust this repository to execute its local Nx plugins.",
            ));
        }
    }
    if root.join("pnpm-workspace.yaml").exists() && repo.trusted {
        match command::run(
            root,
            "pnpm",
            &["list", "--recursive", "--depth", "1", "--json"],
        )
        .await
        {
            Ok(bytes) => match serde_json::from_slice::<Vec<Value>>(&bytes) {
                Ok(packages) => {
                    for package in packages {
                        add_resolved(&mut graph, root, &package);
                    }
                    graph.sources.push(Provenance::observed(
                        "pnpm list --recursive --depth 1 --json (installed dependency data)",
                    ));
                }
                Err(e) => graph
                    .sources
                    .push(Provenance::unavailable("pnpm", &e.to_string())),
            },
            Err(e) => graph
                .sources
                .push(Provenance::unavailable("pnpm", &e.to_string())),
        }
    }
    graph.components = worklens_core::graph_components::detect(&graph);
    Ok(graph)
}

fn merge(graph: &mut Graph, incoming: Graph) {
    for node in incoming.nodes {
        if let Some(existing) = graph
            .nodes
            .iter_mut()
            .find(|p| p.manifest == node.manifest && !node.external)
        {
            // Preserve ecosystem identities: explicit contains relation reconciles equal paths.
            if existing.id != node.id {
                graph.edges.push(Edge {
                    source: existing.id.clone(),
                    target: node.id.clone(),
                    kind: RelationKind::Contains,
                    evidence: Evidence::Observed,
                    origin: node.manifest.clone(),
                });
                graph.nodes.push(node);
            } else {
                *existing = node;
            }
        } else {
            graph.nodes.push(node);
        }
    }
    graph.edges.extend(incoming.edges);
    graph.sources.extend(incoming.sources);
}

pub async fn files(root: &Path) -> Result<Vec<String>> {
    let output = command::git(
        root,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ],
    )
    .await?;
    let mut files: Vec<_> = output
        .split('\0')
        .filter(|p| {
            !p.is_empty()
                && !p
                    .split('/')
                    .any(|part| matches!(part, "node_modules" | "target" | ".git" | ".nx"))
        })
        .take(50_000)
        .map(str::to_owned)
        .collect();
    files.sort();
    files.dedup();
    Ok(files)
}

pub async fn passive(root: &Path) -> Result<Graph> {
    let workspace = crate::catalog_workspace::Workspace::load(root)?;
    let mut graph = Graph {
        components: vec![],
        nodes: vec![],
        edges: vec![],
        sources: vec![Provenance::observed(
            "workspace-scoped JavaScript manifests (declared dependencies)",
        )],
    };
    let mut declarations = Vec::new();
    for file in files(root)
        .await?
        .into_iter()
        .filter(|p| p == "package.json" || p.ends_with("/package.json"))
    {
        let directory = Path::new(&file).parent().unwrap_or(Path::new(""));
        if workspace
            .as_ref()
            .is_some_and(|scope| !scope.contains(&directory.to_string_lossy()))
        {
            continue;
        }
        let Ok(path) = paths::confined(root, &file) else {
            continue;
        };
        let Ok(text) = paths::read_bounded(&path, 1_000_000) else {
            continue;
        };
        let Ok(package) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let Some(name) = package["name"].as_str() else {
            continue;
        };
        let relative = Path::new(&file)
            .parent()
            .unwrap_or(Path::new(""))
            .to_string_lossy()
            .into_owned();
        let id = format!("package:{file}");
        let targets = package["scripts"]
            .as_object()
            .map(|s| s.keys().cloned().collect())
            .unwrap_or_default();
        graph.nodes.push(Project {
            id: id.clone(),
            name: name.into(),
            root: relative,
            kind: "package".into(),
            ecosystem: if workspace.is_some() {
                "pnpm"
            } else {
                "javascript"
            }
            .into(),
            manifest: file.clone(),
            external: false,
            targets,
            features: vec![],
        });
        for field in [
            "dependencies",
            "devDependencies",
            "peerDependencies",
            "optionalDependencies",
        ] {
            if let Some(deps) = package[field].as_object() {
                for (dependency, version) in deps {
                    declarations.push((
                        id.clone(),
                        dependency.clone(),
                        version.as_str().unwrap_or("").to_owned(),
                        format!("{file}#{field}"),
                    ));
                }
            }
        }
    }
    let local: BTreeMap<_, _> = graph
        .nodes
        .iter()
        .map(|n| (n.name.clone(), n.id.clone()))
        .collect();
    for (source, name, version, origin) in declarations {
        let target = local
            .get(&name)
            .filter(|_| {
                version.starts_with("workspace:")
                    || version.starts_with("link:")
                    || version.starts_with("file:")
            })
            .cloned()
            .unwrap_or_else(|| format!("npm:{name}@{version}"));
        if !graph.nodes.iter().any(|n| n.id == target) {
            graph.nodes.push(Project {
                id: target.clone(),
                name,
                root: String::new(),
                kind: "dependency".into(),
                ecosystem: "npm".into(),
                manifest: origin.clone(),
                external: true,
                targets: vec![],
                features: vec![],
            });
        }
        graph.edges.push(Edge {
            source,
            target,
            kind: RelationKind::PackageDependency,
            evidence: Evidence::Declared,
            origin,
        });
    }
    Ok(graph)
}

fn add_resolved(graph: &mut Graph, root: &Path, package: &Value) {
    let Some(path) = package["path"].as_str() else {
        return;
    };
    let Ok(relative) = Path::new(path).strip_prefix(root) else {
        return;
    };
    let manifest = relative.join("package.json").to_string_lossy().into_owned();
    let source = format!("package:{manifest}");
    for field in ["dependencies", "devDependencies", "optionalDependencies"] {
        let Some(deps) = package[field].as_object() else {
            continue;
        };
        for (name, details) in deps {
            let Some(version) = details["version"].as_str() else {
                continue;
            };
            if version.starts_with("link:") {
                continue;
            }
            let id = format!("npm-resolved:{name}@{version}");
            if !graph.nodes.iter().any(|n| n.id == id) {
                graph.nodes.push(Project {
                    id: id.clone(),
                    name: format!("{name}@{version}"),
                    root: String::new(),
                    kind: "resolved dependency".into(),
                    ecosystem: "npm".into(),
                    manifest: "pnpm list".into(),
                    external: true,
                    targets: vec![],
                    features: vec![],
                });
            }
            graph.edges.push(Edge {
                source: source.clone(),
                target: id,
                kind: RelationKind::PackageDependency,
                evidence: Evidence::Observed,
                origin: format!("pnpm list: {manifest}#{field}"),
            });
        }
    }
}
