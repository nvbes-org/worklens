use crate::Result;
use std::path::Path;
use worklens_core::{
    BoundaryConfig, BoundaryViolation, CheckAnnotation, Graph, PrChangedFile, ViolationSeverity,
    evaluate_boundaries,
};

pub fn load_boundary_config(repo_path: &str) -> Option<BoundaryConfig> {
    let config_path = Path::new(repo_path).join(".worklens/boundaries.json");
    if !config_path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&config_path).ok()?;
    serde_json::from_str(&content).ok()
}

pub fn check_workspace_boundaries(
    repo_path: &str,
    graph: &Graph,
) -> Result<(Option<BoundaryConfig>, Vec<BoundaryViolation>)> {
    let Some(config) = load_boundary_config(repo_path) else {
        return Ok((None, Vec::new()));
    };
    let violations = evaluate_boundaries(graph, &config);
    Ok((Some(config), violations))
}

pub fn filter_violations_for_pr(
    violations: &[BoundaryViolation],
    files: &[PrChangedFile],
) -> Vec<BoundaryViolation> {
    violations
        .iter()
        .filter(|v| {
            files
                .iter()
                .any(|f| f.path == v.source_manifest || f.path.starts_with(&v.source_project))
        })
        .cloned()
        .collect()
}

pub fn violations_to_annotations(violations: &[BoundaryViolation]) -> Vec<CheckAnnotation> {
    violations
        .iter()
        .map(|v| CheckAnnotation {
            path: v.source_manifest.clone(),
            start_line: 1,
            end_line: 1,
            annotation_level: match v.severity {
                ViolationSeverity::Failure => "failure".into(),
                ViolationSeverity::Warning => "warning".into(),
                ViolationSeverity::Notice => "notice".into(),
            },
            title: Some(format!(
                "Boundary violation: {} -> {}",
                v.source_layer, v.target_layer
            )),
            message: v.message.clone(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_violations_to_annotations() {
        let v = BoundaryViolation {
            source_project: "app".into(),
            target_project: "db".into(),
            source_layer: "app".into(),
            target_layer: "db".into(),
            source_manifest: "apps/app/Cargo.toml".into(),
            severity: ViolationSeverity::Failure,
            message: "Direct database access forbidden".into(),
            edge_origin: "test".into(),
        };

        let annotations = violations_to_annotations(&[v]);
        assert_eq!(annotations.len(), 1);
        assert_eq!(annotations[0].annotation_level, "failure");
        assert_eq!(annotations[0].path, "apps/app/Cargo.toml");
    }
}
