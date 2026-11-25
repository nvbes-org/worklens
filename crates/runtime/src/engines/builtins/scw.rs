use crate::{Result, command, engines::traits::{EngineContext, ToolingEngine}};
use async_trait::async_trait;
use std::path::Path;
use worklens_core::{EngineKind, Repository, ToolStatus};

pub struct ScwEngine;

#[async_trait]
impl ToolingEngine for ScwEngine {
    fn id(&self) -> &str {
        "scw"
    }
    fn name(&self) -> &str {
        "Scaleway Cloud CLI"
    }
    fn kind(&self) -> EngineKind {
        EngineKind::CloudCli
    }
    fn binaries(&self) -> Vec<String> {
        vec!["scw".into()]
    }
    fn manifest_patterns(&self) -> Vec<String> {
        vec![".scaleway/config.yaml".into(), "scw.yaml".into()]
    }
    fn supported_actions(&self) -> Vec<String> {
        vec!["version".into(), "instance_server_list".into(), "k8s_cluster_list".into()]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        Ok(root.join(".scaleway").exists() || root.join("scw.yaml").exists())
    }

    async fn diagnose(&self) -> ToolStatus {
        let output = command::run(&std::path::PathBuf::from("/"), "scw", &["version"]).await;
        let available = output.is_ok();
        let version = output
            .map(|v| String::from_utf8_lossy(&v).trim().to_owned())
            .unwrap_or_else(|e| e.to_string());
        ToolStatus {
            tool: "scw".into(),
            available,
            version,
        }
    }

    async fn execute_action(
        &self,
        repo: &Repository,
        action: &str,
        _params: &serde_json::Value,
        _context: &EngineContext,
    ) -> Result<serde_json::Value> {
        let root = Path::new(&repo.path);
        match action {
            "instance_server_list" => {
                let out = command::run(root, "scw", &["instance", "server", "list", "-o", "json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "k8s_cluster_list" => {
                let out = command::run(root, "scw", &["k8s", "cluster", "list", "-o", "json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported scw action: {action}") })),
        }
    }
}
