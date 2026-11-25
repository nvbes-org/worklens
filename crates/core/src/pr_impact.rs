use crate::{Edge, Graph, Project, Provenance};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

#[cfg(test)]
#[path = "pr_impact.tests.rs"]
mod tests;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct PrRevision {
    pub base_repository: String,
    pub head_repository: Option<String>,
    pub base_sha: String,
    pub head_sha: String,
    pub expected_files: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PrChangedFile {
    pub path: String,
    pub previous_path: Option<String>,
    pub status: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PrFileCollection {
    pub revision: PrRevision,
    pub files: Vec<PrChangedFile>,
    pub pages_collected: u32,
    pub revision_verified: bool,
    pub provenance: Provenance,
    pub warnings: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ImpactMatch {
    pub project: Project,
    pub paths: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ImpactDependent {
    pub project: Project,
    pub via: Edge,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DetailedImpact {
    pub direct: Vec<ImpactMatch>,
    pub dependants: Vec<ImpactDependent>,
    pub unmatched: Vec<String>,
    pub transversal: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PrImpact {
    pub collection: PrFileCollection,
    pub graph_sources: Vec<Provenance>,
    pub graph_worktree: String,
    pub graph_head: Option<String>,
    pub graph_matches_head: bool,
    pub impact: DetailedImpact,
    pub warnings: Vec<String>,
}

pub fn detailed_impact(graph: &Graph, files: &[PrChangedFile]) -> DetailedImpact {
    let paths: BTreeSet<_> = files
        .iter()
        .flat_map(|f| std::iter::once(f.path.clone()).chain(f.previous_path.clone()))
        .collect();
    let mut direct = Vec::new();
    let mut matched = BTreeSet::new();
    for project in graph.nodes.iter().filter(|p| !p.external) {
        let owned: Vec<_> = paths
            .iter()
            .filter(|path| {
                project.root.is_empty()
                    || project.root == "."
                    || **path == project.root
                    || path.starts_with(&format!("{}/", project.root))
            })
            .cloned()
            .collect();
        if !owned.is_empty() {
            matched.extend(owned.clone());
            direct.push(ImpactMatch {
                project: project.clone(),
                paths: owned,
            });
        }
    }
    let mut reached: BTreeSet<_> = direct.iter().map(|m| m.project.id.clone()).collect();
    let projects: BTreeMap<_, _> = graph
        .nodes
        .iter()
        .filter(|p| !p.external)
        .map(|p| (p.id.as_str(), p))
        .collect();
    let mut dependants = Vec::new();
    loop {
        let before = reached.len();
        for edge in &graph.edges {
            if matches!(
                edge.kind,
                crate::RelationKind::Contains | crate::RelationKind::TaskDependency
            ) {
                continue;
            }
            if reached.contains(&edge.target)
                && !reached.contains(&edge.source)
                && let Some(project) = projects.get(edge.source.as_str())
            {
                reached.insert(edge.source.clone());
                dependants.push(ImpactDependent {
                    project: (*project).clone(),
                    via: edge.clone(),
                });
            }
        }
        if before == reached.len() {
            break;
        }
    }
    let transversal = paths
        .iter()
        .filter(|p| {
            matches!(
                p.as_str(),
                "Cargo.toml"
                    | "Cargo.lock"
                    | "package.json"
                    | "pnpm-lock.yaml"
                    | "pnpm-workspace.yaml"
                    | "nx.json"
            ) || p.starts_with(".github/")
        })
        .cloned()
        .collect();
    DetailedImpact {
        direct,
        dependants,
        unmatched: paths.difference(&matched).cloned().collect(),
        transversal,
    }
}
