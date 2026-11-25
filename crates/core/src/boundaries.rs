use crate::{Graph, RelationKind};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum ViolationSeverity {
    Failure,
    Warning,
    Notice,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[serde(rename_all = "camelCase")]
pub struct LayerConfig {
    #[serde(default)]
    pub match_patterns: Vec<String>,
    #[serde(default)]
    pub allowed_dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BoundaryRule {
    pub name: String,
    pub severity: ViolationSeverity,
    pub message: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BoundaryConfig {
    #[serde(default)]
    pub layers: BTreeMap<String, LayerConfig>,
    #[serde(default)]
    pub rules: Vec<BoundaryRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BoundaryViolation {
    pub source_project: String,
    pub target_project: String,
    pub source_layer: String,
    pub target_layer: String,
    pub source_manifest: String,
    pub severity: ViolationSeverity,
    pub message: String,
    pub edge_origin: String,
}

pub fn matches_pattern(pattern: &str, path: &str) -> bool {
    let clean_pattern = pattern.trim_matches('/');
    let clean_path = path.trim_matches('/');

    if let Some(prefix) = clean_pattern.strip_suffix("/**") {
        return clean_path == prefix || clean_path.starts_with(&format!("{prefix}/"));
    }
    if let Some(prefix) = clean_pattern.strip_suffix("/*") {
        if clean_path.starts_with(&format!("{prefix}/")) {
            let remainder = &clean_path[prefix.len() + 1..];
            return !remainder.contains('/');
        }
        return false;
    }
    clean_pattern == clean_path
}

pub fn find_layer<'a>(config: &'a BoundaryConfig, project_root: &str) -> Option<&'a str> {
    for (layer_name, layer) in &config.layers {
        for pattern in &layer.match_patterns {
            if matches_pattern(pattern, project_root) {
                return Some(layer_name.as_str());
            }
        }
    }
    None
}

pub fn evaluate_boundaries(graph: &Graph, config: &BoundaryConfig) -> Vec<BoundaryViolation> {
    let mut violations = Vec::new();
    let project_map: BTreeMap<_, _> = graph.nodes.iter().map(|n| (&n.id, n)).collect();

    for edge in &graph.edges {
        match edge.kind {
            RelationKind::ProjectDependency | RelationKind::PackageDependency => {}
            _ => continue,
        }

        let Some(source_node) = project_map.get(&edge.source) else {
            continue;
        };
        let Some(target_node) = project_map.get(&edge.target) else {
            continue;
        };

        if target_node.external {
            continue;
        }

        let Some(source_layer) = find_layer(config, &source_node.root) else {
            continue;
        };
        let Some(target_layer) = find_layer(config, &target_node.root) else {
            continue;
        };

        if source_layer == target_layer {
            continue;
        }

        if let Some(layer_def) = config.layers.get(source_layer) {
            let is_allowed = layer_def
                .allowed_dependencies
                .iter()
                .any(|allowed| allowed == target_layer);

            if !is_allowed {
                violations.push(BoundaryViolation {
                    source_project: source_node.name.clone(),
                    target_project: target_node.name.clone(),
                    source_layer: source_layer.to_string(),
                    target_layer: target_layer.to_string(),
                    source_manifest: source_node.manifest.clone(),
                    severity: ViolationSeverity::Failure,
                    message: format!(
                        "Layer '{source_layer}' is not allowed to depend on layer '{target_layer}' (from {} to {})",
                        source_node.name, target_node.name
                    ),
                    edge_origin: edge.origin.clone(),
                });
            }
        }
    }

    violations
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Edge, Evidence, Project};

    #[test]
    fn test_pattern_matching() {
        assert!(matches_pattern("apps/**", "apps/desktop"));
        assert!(matches_pattern("apps/**", "apps/desktop/src"));
        assert!(matches_pattern("crates/core/**", "crates/core"));
        assert!(!matches_pattern("crates/core/**", "crates/runtime"));
        assert!(matches_pattern("packages/*", "packages/contracts"));
        assert!(!matches_pattern("packages/*", "packages/contracts/nested"));
    }

    #[test]
    fn test_boundary_evaluation() {
        let mut config = BoundaryConfig::default();
        config.layers.insert(
            "core".into(),
            LayerConfig {
                match_patterns: vec!["crates/core/**".into()],
                allowed_dependencies: vec![],
            },
        );
        config.layers.insert(
            "runtime".into(),
            LayerConfig {
                match_patterns: vec!["crates/runtime/**".into()],
                allowed_dependencies: vec!["core".into()],
            },
        );

        let core_node = Project {
            id: "pkg:core".into(),
            name: "core".into(),
            root: "crates/core".into(),
            kind: "cargo".into(),
            ecosystem: "cargo".into(),
            manifest: "crates/core/Cargo.toml".into(),
            external: false,
            targets: vec![],
            features: vec![],
        };

        let runtime_node = Project {
            id: "pkg:runtime".into(),
            name: "runtime".into(),
            root: "crates/runtime".into(),
            kind: "cargo".into(),
            ecosystem: "cargo".into(),
            manifest: "crates/runtime/Cargo.toml".into(),
            external: false,
            targets: vec![],
            features: vec![],
        };

        // Allowed: runtime -> core
        let valid_edge = Edge {
            source: "pkg:runtime".into(),
            target: "pkg:core".into(),
            kind: RelationKind::PackageDependency,
            evidence: Evidence::Observed,
            origin: "test".into(),
        };

        let graph = Graph {
            nodes: vec![core_node.clone(), runtime_node.clone()],
            edges: vec![valid_edge],
            sources: vec![],
            components: vec![],
        };

        let violations = evaluate_boundaries(&graph, &config);
        assert!(violations.is_empty());

        // Forbidden: core -> runtime
        let invalid_edge = Edge {
            source: "pkg:core".into(),
            target: "pkg:runtime".into(),
            kind: RelationKind::PackageDependency,
            evidence: Evidence::Observed,
            origin: "test".into(),
        };

        let invalid_graph = Graph {
            nodes: vec![core_node, runtime_node],
            edges: vec![invalid_edge],
            sources: vec![],
            components: vec![],
        };

        let violations = evaluate_boundaries(&invalid_graph, &config);
        assert_eq!(violations.len(), 1);
        assert_eq!(violations[0].source_layer, "core");
        assert_eq!(violations[0].target_layer, "runtime");
    }
}
