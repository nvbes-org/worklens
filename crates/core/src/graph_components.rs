use crate::{ComponentGroup, Graph, stable_id};
use std::{
    collections::BTreeMap,
    path::{Component, Path},
};

/// A project directory is the cross-tool identity, never its display name.
/// Keep nested projects and external dependencies distinct. Reject paths that
/// cannot be interpreted as repository-relative identities.
fn directory(root: &str) -> Option<String> {
    let mut parts = Vec::new();
    for part in Path::new(root).components() {
        match part {
            Component::Normal(value) => parts.push(value.to_str()?),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(parts.join("/"))
}

pub fn detect(graph: &Graph) -> Vec<ComponentGroup> {
    let mut groups: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for node in &graph.nodes {
        if !node.external
            && let Some(root) = directory(&node.root)
        {
            groups.entry(root).or_default().push(node.id.clone());
        }
    }
    groups
        .into_iter()
        .filter_map(|(root, mut member_ids)| {
            member_ids.sort();
            member_ids.dedup();
            (member_ids.len() > 1).then(|| ComponentGroup {
                id: stable_id("component", &root),
                member_ids,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Project;

    fn project(id: &str, root: &str, external: bool) -> Project {
        Project {
            id: id.into(),
            name: "same-name".into(),
            root: root.into(),
            external,
            kind: "project".into(),
            ecosystem: id.into(),
            manifest: format!("{root}/manifest"),
            targets: vec![],
            features: vec![],
        }
    }
    #[test]
    fn merges_same_directory_across_tools_but_not_names_parents_or_externals() {
        let graph = Graph {
            nodes: vec![
                project("nx:api", "apps/api", false),
                project("cargo:api", "./apps/api/", false),
                project("pnpm:api", "apps/api", false),
                project("nx:child", "apps/api/child", false),
                project("nx:other", "apps/other", false),
                project("npm:external", "apps/api", true),
                project("bad", "../apps/api", false),
            ],
            edges: vec![],
            sources: vec![],
            components: vec![],
        };
        let groups = detect(&graph);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].member_ids, ["cargo:api", "nx:api", "pnpm:api"]);
        let mut reversed = graph.clone();
        reversed.nodes.reverse();
        assert_eq!(groups[0].id, detect(&reversed)[0].id);
    }
    #[test]
    fn root_project_normalization_and_old_cache_compatibility() {
        let graph = Graph {
            nodes: vec![
                project("nx:root", ".", false),
                project("package:root", "", false),
            ],
            edges: vec![],
            sources: vec![],
            components: vec![],
        };
        assert_eq!(detect(&graph).len(), 1);
        let old: Graph = serde_json::from_str(r#"{"nodes":[],"edges":[],"sources":[]}"#).unwrap();
        assert!(old.components.is_empty());
    }
}
