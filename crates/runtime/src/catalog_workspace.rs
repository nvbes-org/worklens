use crate::{Result, error, paths};
use globset::{GlobBuilder, GlobSet, GlobSetBuilder};
use serde::Deserialize;
use std::{collections::BTreeSet, path::Path};
use worklens_core::Graph;

#[derive(Default, Deserialize)]
struct Manifest {
    #[serde(default)]
    packages: Vec<String>,
}

pub struct Workspace {
    include: GlobSet,
    exclude: GlobSet,
}

impl Workspace {
    pub fn load(root: &Path) -> Result<Option<Self>> {
        if !root.join("pnpm-workspace.yaml").try_exists()? {
            return Ok(None);
        }
        let path = paths::confined(root, "pnpm-workspace.yaml")?;
        let text = paths::read_bounded(&path, 1_000_000)?;
        let manifest: Manifest = serde_yaml_ng::from_str(&text)
            .map_err(|e| error(format!("Invalid pnpm-workspace.yaml: {e}")))?;
        let mut include = GlobSetBuilder::new();
        let mut exclude = GlobSetBuilder::new();
        for pattern in manifest.packages {
            let (negative, pattern) = match pattern.strip_prefix('!') {
                Some(pattern) => (true, pattern),
                None => (false, pattern.as_str()),
            };
            if pattern.starts_with('/') || pattern.contains('(') {
                return Err(error("Unsupported pnpm workspace pattern"));
            }
            let mut parts = Vec::new();
            for part in pattern.split('/') {
                match part {
                    "" | "." => {}
                    ".." => {
                        if parts.pop().is_none() {
                            return Err(error("Workspace pattern escapes repository"));
                        }
                    }
                    part => parts.push(part),
                }
            }
            let pattern = parts.join("/");
            let glob = GlobBuilder::new(&pattern)
                .literal_separator(true)
                .build()
                .map_err(|e| error(format!("Invalid pnpm workspace pattern: {e}")))?;
            if negative {
                exclude.add(glob);
                if let Some(parent) = pattern.strip_suffix("/**") {
                    exclude.add(
                        GlobBuilder::new(parent)
                            .literal_separator(true)
                            .build()
                            .map_err(|e| error(e.to_string()))?,
                    );
                }
            } else {
                include.add(glob);
            }
        }
        Ok(Some(Self {
            include: include.build().map_err(|e| error(e.to_string()))?,
            exclude: exclude.build().map_err(|e| error(e.to_string()))?,
        }))
    }

    pub fn contains(&self, directory: &str) -> bool {
        directory.is_empty()
            || directory == "."
            || (self.include.is_match(directory) && !self.exclude.is_match(directory))
    }
}

/// Apply current workspace membership even to snapshots collected by older engines.
pub fn filter_cached(root: &Path, graph: &mut Graph) -> Result<()> {
    let workspace = Workspace::load(root)?;
    graph.nodes.retain(|node| {
        !node.id.starts_with("package:")
            || (!node
                .root
                .split('/')
                .any(|part| matches!(part, "vendor" | "vendors"))
                && workspace
                    .as_ref()
                    .is_none_or(|scope| scope.contains(&node.root)))
    });
    let ids: BTreeSet<_> = graph.nodes.iter().map(|node| node.id.as_str()).collect();
    graph
        .edges
        .retain(|edge| ids.contains(edge.source.as_str()) && ids.contains(edge.target.as_str()));
    let connected: BTreeSet<_> = graph
        .edges
        .iter()
        .flat_map(|edge| [&edge.source, &edge.target])
        .collect();
    graph
        .nodes
        .retain(|node| !node.external || connected.contains(&node.id));
    if workspace.is_none() {
        for node in &mut graph.nodes {
            if node.id.starts_with("package:") {
                node.ecosystem = "javascript".into();
            }
        }
    }
    Ok(())
}
