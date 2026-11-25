use crate::{Result, cloud_cicd, cloud_hcl, error};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
use worklens_core::{CloudProvider, CloudResource, CloudScanResult, CloudStats, now};

const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    ".terraform",
    "vendor",
    "vendors",
    ".nx",
    "build",
    "out",
    ".cache",
];

pub async fn scan_repository(root: &Path) -> Result<CloudScanResult> {
    if !root.is_dir() {
        return Err(error("Repository path does not exist"));
    }

    let mut iac_paths = Vec::new();
    let mut workflow_paths = Vec::new();

    collect_candidate_files(root, root, 0, &mut iac_paths, &mut workflow_paths).await?;

    let mut resources = Vec::new();
    let mut modules = Vec::new();
    let mut variables = Vec::new();
    let mut outputs = Vec::new();
    let mut backends = Vec::new();
    let mut pipelines = Vec::new();
    let mut warnings = Vec::new();

    let iac_count = iac_paths.len() as u32;

    for (full_path, rel_path) in iac_paths {
        match tokio::fs::read_to_string(&full_path).await {
            Ok(content) => {
                if rel_path.ends_with(".tfstate") {
                    parse_tfstate(&rel_path, &content, &mut resources);
                } else {
                    let parsed = cloud_hcl::parse_tf_file(&rel_path, &content);
                    resources.extend(parsed.resources);
                    modules.extend(parsed.modules);
                    variables.extend(parsed.variables);
                    outputs.extend(parsed.outputs);
                    backends.extend(parsed.backends);
                }
            }
            Err(e) => {
                warnings.push(format!("Failed to read {rel_path}: {e}"));
            }
        }
    }

    for (full_path, rel_path) in workflow_paths {
        match tokio::fs::read_to_string(&full_path).await {
            Ok(content) => {
                if let Some(pipeline) = cloud_cicd::parse_workflow_file(&rel_path, &content) {
                    pipelines.push(pipeline);
                }
            }
            Err(e) => {
                warnings.push(format!("Failed to read {rel_path}: {e}"));
            }
        }
    }

    // Compute aggregated statistics
    let mut by_provider: HashMap<String, u32> = HashMap::new();
    let mut by_category: HashMap<String, u32> = HashMap::new();
    let mut by_environment: HashMap<String, u32> = HashMap::new();

    for r in &resources {
        let p_key = match &r.provider {
            CloudProvider::Aws => "aws".to_string(),
            CloudProvider::Gcp => "gcp".to_string(),
            CloudProvider::Scaleway => "scaleway".to_string(),
            CloudProvider::Azure => "azure".to_string(),
            CloudProvider::Other(o) => o.clone(),
        };
        *by_provider.entry(p_key).or_insert(0) += 1;

        let c_key = format!("{:?}", r.category).to_ascii_lowercase();
        *by_category.entry(c_key).or_insert(0) += 1;

        if let Some(env) = &r.environment {
            *by_environment.entry(env.clone()).or_insert(0) += 1;
        }
    }

    // Also factor in pipeline providers if resources were empty
    for p in &pipelines {
        for prov in &p.providers {
            let key = match prov {
                CloudProvider::Aws => "aws",
                CloudProvider::Gcp => "gcp",
                CloudProvider::Scaleway => "scaleway",
                CloudProvider::Azure => "azure",
                CloudProvider::Other(o) => o.as_str(),
            };
            by_provider.entry(key.to_string()).or_insert(0);
        }
    }

    // Check for live Scaleway data if authenticated
    let scaleway_live = if let Ok((token, source)) = crate::scaleway_auth::token() {
        Some(crate::scaleway_client::fetch_live_report(&token, source, None).await)
    } else {
        None
    };

    let live_scw_count = scaleway_live
        .as_ref()
        .map(|l| (l.servers.len() + l.databases.len() + l.k8s_clusters.len()) as u32)
        .unwrap_or(0);

    let architecture = crate::cloud_arch::build_architecture_graph(
        &resources,
        &modules,
        &pipelines,
        scaleway_live.as_ref(),
    );

    let stats = CloudStats {
        total_resources: resources.len() as u32,
        by_provider,
        by_category,
        by_environment,
        iac_files_count: iac_count,
        modules_count: modules.len() as u32,
        pipelines_count: pipelines.len() as u32,
        live_scaleway_resources: live_scw_count,
    };

    Ok(CloudScanResult {
        scanned_at: now(),
        stats,
        resources,
        modules,
        variables,
        outputs,
        backends,
        pipelines,
        architecture,
        scaleway_live,
        warnings,
    })
}

fn collect_candidate_files<'a>(
    dir: &'a Path,
    root: &'a Path,
    depth: usize,
    iac_files: &'a mut Vec<(PathBuf, String)>,
    workflow_files: &'a mut Vec<(PathBuf, String)>,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<()>> + Send + 'a>> {
    Box::pin(async move {
        if depth > 8 || (iac_files.len() + workflow_files.len()) > 2000 {
            return Ok(());
        }

        let mut entries = match tokio::fs::read_dir(dir).await {
            Ok(e) => e,
            Err(_) => return Ok(()),
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            let name = entry.file_name();
            let name_str = name.to_string_lossy();

            if entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false) {
                if !IGNORED_DIRS.contains(&name_str.as_ref()) && !name_str.starts_with('.') {
                    collect_candidate_files(&path, root, depth + 1, iac_files, workflow_files).await?;
                } else if name_str == ".github" {
                    collect_candidate_files(&path, root, depth + 1, iac_files, workflow_files).await?;
                }
            } else {
                let rel = path
                    .strip_prefix(root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();

                if name_str.ends_with(".tf")
                    || name_str.ends_with(".tofu")
                    || name_str.ends_with(".tfvars")
                    || name_str.ends_with(".tfstate")
                {
                    iac_files.push((path, rel));
                } else if rel.starts_with(".github/workflows")
                    && (name_str.ends_with(".yml") || name_str.ends_with(".yaml"))
                {
                    workflow_files.push((path, rel));
                }
            }
        }
        Ok(())
    })
}

fn parse_tfstate(rel_path: &str, content: &str, resources: &mut Vec<CloudResource>) {
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(content) {
        if let Some(res_arr) = val.get("resources").and_then(|r| r.as_array()) {
            for item in res_arr {
                let r_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                let r_name = item.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if r_type.is_empty() || r_name.is_empty() {
                    continue;
                }
                let provider = cloud_hcl::infer_provider(r_type);
                let category = cloud_hcl::infer_category(r_type);

                let mut attrs = HashMap::new();
                let tags = HashMap::new();

                if let Some(instances) = item.get("instances").and_then(|i| i.as_array()) {
                    if let Some(inst) = instances.first() {
                        if let Some(attr_obj) = inst.get("attributes").and_then(|a| a.as_object()) {
                            for (k, v) in attr_obj {
                                if let Some(s) = v.as_str() {
                                    attrs.insert(k.clone(), s.to_string());
                                }
                            }
                        }
                    }
                }

                let env = cloud_hcl::infer_environment(rel_path, &tags);
                let region = attrs.get("region").cloned().or_else(|| attrs.get("zone").cloned());

                resources.push(CloudResource {
                    id: format!("{r_type}.{r_name}"),
                    name: r_name.to_string(),
                    resource_type: r_type.to_string(),
                    provider,
                    category,
                    source_file: rel_path.to_string(),
                    line_number: None,
                    region,
                    environment: env,
                    attributes: attrs,
                    tags,
                    dependencies: Vec::new(),
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_scan_repository_empty_and_populated() {
        let dir = tempdir().unwrap();
        let root = dir.path();

        // 1. Create a terraform file with AWS and Scaleway
        let tf_dir = root.join("terraform");
        tokio::fs::create_dir_all(&tf_dir).await.unwrap();
        tokio::fs::write(
            tf_dir.join("main.tf"),
            r#"
            resource "scaleway_instance_server" "web" {
              type = "PLAY2-NANO"
              zone = "fr-par-1"
            }
            resource "aws_s3_bucket" "data" {
              bucket = "my-data-bucket"
            }
            "#,
        )
        .await
        .unwrap();

        // 2. Create a github action deploy file
        let wf_dir = root.join(".github").join("workflows");
        tokio::fs::create_dir_all(&wf_dir).await.unwrap();
        tokio::fs::write(
            wf_dir.join("deploy.yml"),
            r#"
            name: CD Deploy
            on: [push]
            jobs:
              deploy:
                environment: production
                runs-on: ubuntu-latest
                steps:
                  - uses: aws-actions/configure-aws-credentials@v4
            "#,
        )
        .await
        .unwrap();

        let res = scan_repository(root).await.unwrap();
        assert_eq!(res.resources.len(), 2);
        assert_eq!(res.pipelines.len(), 1);
        assert_eq!(res.stats.total_resources, 2);
        assert_eq!(*res.stats.by_provider.get("scaleway").unwrap_or(&0), 1);
        assert_eq!(*res.stats.by_provider.get("aws").unwrap_or(&0), 1);
        assert_eq!(res.stats.pipelines_count, 1);
    }
}
