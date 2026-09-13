use crate::{Result, paths};
use serde_json::Value;
use std::{collections::BTreeSet, path::Path};
use worklens_core::{Availability, Edge, Evidence, Graph, Project, Provenance, RelationKind};

/// Explicit, bounded discovery of vendored manifests, including ignored vendor folders.
/// Symlinks and unrelated archive/build/cache trees are never traversed.
pub fn extend(root: &Path, graph: &mut Graph) -> Result<()> {
    let mut pending = vec![(root.to_path_buf(), false)];
    let mut manifests = Vec::new();
    let mut visited = 0;
    let mut partial = false;
    while let Some((directory, vendor)) = pending.pop() {
        let entries = match std::fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(_) => {
                partial = true;
                continue;
            }
        };
        for entry in entries {
            visited += 1;
            if visited > 30_000 || manifests.len() >= 1000 {
                partial = true;
                break;
            }
            let entry = entry?;
            let kind = entry.file_type()?;
            if kind.is_symlink() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if kind.is_dir() {
                if name.starts_with('.')
                    || matches!(
                        name.as_str(),
                        "node_modules"
                            | "target"
                            | "dist"
                            | "build"
                            | "archive"
                            | "archives"
                            | "artifacts"
                    )
                {
                    continue;
                }
                pending.push((
                    entry.path(),
                    vendor || matches!(name.as_str(), "vendor" | "vendors"),
                ));
            } else if kind.is_file()
                && vendor
                && matches!(name.as_str(), "package.json" | "Cargo.toml")
            {
                manifests.push(entry.path());
            }
        }
        if visited > 30_000 || manifests.len() >= 1000 {
            break;
        }
    }
    manifests.sort();
    let mut declarations = Vec::new();
    for manifest in manifests {
        let relative = manifest
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let parsed = (|| -> Result<Value> {
            let text = paths::read_bounded(&paths::confined(root, &relative)?, 1_000_000)?;
            if relative.ends_with("Cargo.toml") {
                let value: toml::Value =
                    toml::from_str(&text).map_err(|e| crate::error(e.to_string()))?;
                Ok(serde_json::to_value(value)?)
            } else {
                Ok(serde_json::from_str(&text)?)
            }
        })();
        let value = match parsed {
            Ok(value) => value,
            Err(_) => {
                partial = true;
                continue;
            }
        };
        let cargo = relative.ends_with("Cargo.toml");
        let package = if cargo { &value["package"] } else { &value };
        let Some(name) = package["name"].as_str() else {
            continue;
        };
        let ecosystem = if cargo { "cargo" } else { "npm" };
        let id = graph
            .nodes
            .iter()
            .find(|node| node.manifest == relative)
            .map(|node| node.id.clone())
            .unwrap_or_else(|| format!("vendor:{relative}"));
        if let Some(existing) = graph.nodes.iter_mut().find(|node| node.id == id) {
            existing.external = true;
            existing.kind = "vendor".into();
        } else {
            graph.nodes.push(Project {
                id: id.clone(),
                name: name.into(),
                root: Path::new(&relative)
                    .parent()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
                kind: "vendor".into(),
                ecosystem: ecosystem.into(),
                manifest: relative.clone(),
                external: true,
                targets: vec![],
                features: vec![],
            });
        }
        let fields: &[&str] = if cargo {
            &["dependencies", "dev-dependencies", "build-dependencies"]
        } else {
            &[
                "dependencies",
                "devDependencies",
                "peerDependencies",
                "optionalDependencies",
            ]
        };
        for field in fields {
            if let Some(deps) = value[field].as_object() {
                for (alias, spec) in deps {
                    let name = spec["package"].as_str().unwrap_or(alias);
                    let version = spec
                        .as_str()
                        .or_else(|| spec["version"].as_str())
                        .unwrap_or("unspecified");
                    declarations.push((
                        id.clone(),
                        ecosystem,
                        name.to_owned(),
                        version.to_owned(),
                        format!("{relative}#{field}"),
                    ));
                }
            }
        }
    }
    for (source, ecosystem, name, version, origin) in declarations {
        // A declaration is not installed-resolution evidence. Do not guess a vendor by name.
        let target = format!("vendor-dependency:{ecosystem}:{name}@{version}");
        if !graph.nodes.iter().any(|node| node.id == target) {
            graph.nodes.push(Project {
                id: target.clone(),
                name: format!("{name}@{version}"),
                root: String::new(),
                kind: "dependency".into(),
                ecosystem: ecosystem.into(),
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
    let ids: BTreeSet<_> = graph
        .nodes
        .iter()
        .filter(|node| !node.external)
        .map(|node| &node.id)
        .collect();
    graph
        .components
        .retain(|group| group.member_ids.iter().all(|id| ids.contains(id)));
    let mut source = Provenance::observed("vendor manifests (passive, declared dependencies only)");
    if partial {
        source.status = Availability::Partial;
        source.detail = Some("Some manifests were unreadable, invalid, or exceeded discovery limits (30,000 entries / 1,000 manifests).".into());
    }
    graph.sources.push(source);
    Ok(())
}
