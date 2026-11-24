use std::collections::{HashMap, HashSet};
use worklens_core::{
    CloudArchitectureEdge, CloudArchitectureGraph, CloudArchitectureNode, CloudDeploymentPipeline,
    CloudModule, CloudProvider, CloudResource, CloudResourceCategory, ScalewayLiveReport,
};

pub fn build_architecture_graph(
    resources: &[CloudResource],
    modules: &[CloudModule],
    pipelines: &[CloudDeploymentPipeline],
    scaleway_live: Option<&ScalewayLiveReport>,
) -> CloudArchitectureGraph {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut existing_node_ids = HashSet::new();

    // 1. Build Resource Nodes
    for res in resources {
        let mut status = Some("configured".to_string());
        let mut is_live = false;
        let mut metadata = HashMap::new();

        metadata.insert("resource_type".to_string(), res.resource_type.clone());
        metadata.insert("source_file".to_string(), res.source_file.clone());
        if let Some(r) = &res.region {
            metadata.insert("region".to_string(), r.clone());
        }
        for (k, v) in &res.attributes {
            metadata.insert(k.clone(), v.clone());
        }

        // Correlate with Scaleway live data if applicable
        if matches!(res.provider, CloudProvider::Scaleway) {
            if let Some(live) = scaleway_live {
                if let Some(srv) = live.servers.iter().find(|s| s.name == res.name || s.id == res.name) {
                    status = Some(srv.status.clone());
                    is_live = true;
                    if let Some(ip) = &srv.public_ip {
                        metadata.insert("public_ip".to_string(), ip.clone());
                    }
                    metadata.insert("commercial_type".to_string(), srv.commercial_type.clone());
                } else if let Some(db) = live.databases.iter().find(|d| d.name == res.name || d.id == res.name) {
                    status = Some(db.status.clone());
                    is_live = true;
                    metadata.insert("engine".to_string(), db.engine.clone());
                    if let Some(ep) = &db.endpoint {
                        metadata.insert("endpoint".to_string(), ep.clone());
                    }
                } else if let Some(k8s) = live.k8s_clusters.iter().find(|c| c.name == res.name || c.id == res.name) {
                    status = Some(k8s.status.clone());
                    is_live = true;
                    metadata.insert("k8s_version".to_string(), k8s.version.clone());
                }
            }
        }

        existing_node_ids.insert(res.id.clone());
        nodes.push(CloudArchitectureNode {
            id: res.id.clone(),
            name: res.name.clone(),
            node_type: "resource".to_string(),
            provider: res.provider.clone(),
            category: res.category.clone(),
            environment: res.environment.clone(),
            status,
            is_live,
            metadata,
        });
    }

    // 2. Build Module Nodes
    for m in modules {
        let m_id = format!("module.{}", m.name);
        existing_node_ids.insert(m_id.clone());

        let mut metadata = HashMap::new();
        metadata.insert("source".to_string(), m.source.clone());
        if let Some(v) = &m.version {
            metadata.insert("version".to_string(), v.clone());
        }

        nodes.push(CloudArchitectureNode {
            id: m_id,
            name: m.name.clone(),
            node_type: "module".to_string(),
            provider: m.providers.first().cloned().unwrap_or(CloudProvider::Other("module".into())),
            category: CloudResourceCategory::Other,
            environment: None,
            status: Some("module".to_string()),
            is_live: false,
            metadata,
        });
    }

    // 3. Build CI/CD Pipeline Nodes
    for p in pipelines {
        let p_id = format!("pipeline:{}", p.id);
        existing_node_ids.insert(p_id.clone());

        let mut metadata = HashMap::new();
        metadata.insert("file_path".to_string(), p.file_path.clone());
        metadata.insert("triggers".to_string(), p.triggers.join(", "));

        nodes.push(CloudArchitectureNode {
            id: p_id,
            name: p.name.clone(),
            node_type: "pipeline".to_string(),
            provider: p.providers.first().cloned().unwrap_or(CloudProvider::Other("github".into())),
            category: CloudResourceCategory::Other,
            environment: p.environments.first().cloned(),
            status: Some("active".to_string()),
            is_live: false,
            metadata,
        });
    }

    // 4. Add unmanaged live Scaleway resources
    if let Some(live) = scaleway_live {
        for srv in &live.servers {
            let s_id = format!("scaleway_instance_server.{}", srv.name);
            if !existing_node_ids.contains(&s_id) {
                let mut meta = HashMap::new();
                meta.insert("commercial_type".to_string(), srv.commercial_type.clone());
                meta.insert("zone".to_string(), srv.zone.clone());
                if let Some(ip) = &srv.public_ip {
                    meta.insert("public_ip".to_string(), ip.clone());
                }

                existing_node_ids.insert(s_id.clone());
                nodes.push(CloudArchitectureNode {
                    id: s_id,
                    name: srv.name.clone(),
                    node_type: "live_server".to_string(),
                    provider: CloudProvider::Scaleway,
                    category: CloudResourceCategory::Compute,
                    environment: None,
                    status: Some(srv.status.clone()),
                    is_live: true,
                    metadata: meta,
                });
            }
        }
    }

    // 5. Build Dependency Edges
    for res in resources {
        for dep in &res.dependencies {
            let relation = if dep.contains("vpc") || dep.contains("subnet") || dep.contains("private_network") || dep.contains("network") {
                "network".to_string()
            } else if dep.contains("db") || dep.contains("rdb") || dep.contains("sql") {
                "database".to_string()
            } else if dep.contains("bucket") || dep.contains("storage") || dep.contains("s3") {
                "storage".to_string()
            } else if dep.contains("iam") || dep.contains("role") || dep.contains("policy") || dep.contains("security_group") {
                "security".to_string()
            } else if dep.starts_with("module.") {
                "module".to_string()
            } else {
                "dependency".to_string()
            };

            let label = match relation.as_str() {
                "network" => Some("Attachement Réseau".to_string()),
                "database" => Some("Accès Base".to_string()),
                "storage" => Some("Stockage".to_string()),
                "security" => Some("Sécurité & IAM".to_string()),
                "module" => Some("Composant Module".to_string()),
                _ => Some("Dépendance".to_string()),
            };

            edges.push(CloudArchitectureEdge {
                source: res.id.clone(),
                target: dep.clone(),
                relation,
                label,
            });
        }
    }

    // 6. Connect CI/CD pipelines to target resources/modules
    for p in pipelines {
        let p_id = format!("pipeline:{}", p.id);
        for res in resources {
            let matches_prov = p.providers.is_empty() || p.providers.contains(&res.provider);
            let matches_env = p.environments.is_empty()
                || res.environment.as_ref().map(|e| p.environments.contains(e)).unwrap_or(false);

            if matches_prov && (p.is_iac || matches_env) {
                edges.push(CloudArchitectureEdge {
                    source: p_id.clone(),
                    target: res.id.clone(),
                    relation: "deploys".to_string(),
                    label: Some("Déploiement".to_string()),
                });
            }
        }
    }

    CloudArchitectureGraph { nodes, edges }
}

#[cfg(test)]
#[path = "cloud_arch.tests.rs"]
mod tests;
