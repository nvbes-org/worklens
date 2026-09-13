use crate::Provenance;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum RelationKind {
    ProjectDependency,
    PackageDependency,
    TaskDependency,
    Contains,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Evidence {
    Observed,
    Declared,
    Candidate,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub root: String,
    pub kind: String,
    pub ecosystem: String,
    pub manifest: String,
    pub external: bool,
    pub targets: Vec<String>,
    pub features: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Edge {
    pub source: String,
    pub target: String,
    pub kind: RelationKind,
    pub evidence: Evidence,
    pub origin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Graph {
    pub nodes: Vec<Project>,
    pub edges: Vec<Edge>,
    pub sources: Vec<Provenance>,
    /// Presentation identities; raw nodes remain available for evidence and task queries.
    #[serde(default)]
    pub components: Vec<ComponentGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ComponentGroup {
    pub id: String,
    pub member_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Impact {
    pub direct: Vec<String>,
    pub dependants: Vec<String>,
    pub warning: String,
}

pub fn impact(graph: &Graph, paths: &[String]) -> Impact {
    use std::collections::BTreeSet;
    let direct: BTreeSet<_> = graph
        .nodes
        .iter()
        .filter(|n| {
            !n.external
                && paths.iter().any(|p| {
                    n.root.is_empty()
                        || n.root == "."
                        || p == &n.root
                        || p.starts_with(&format!("{}/", n.root))
                })
        })
        .map(|n| n.id.clone())
        .collect();
    let mut reached = direct.clone();
    loop {
        let before = reached.len();
        for edge in &graph.edges {
            if reached.contains(&edge.target) {
                reached.insert(edge.source.clone());
            }
        }
        if before == reached.len() {
            break;
        }
    }
    Impact {
        direct: direct.iter().cloned().collect(),
        dependants: reached.difference(&direct).cloned().collect(),
        warning:
            "Dependency reachability is an impact estimate, not proof of sufficient validation."
                .into(),
    }
}
