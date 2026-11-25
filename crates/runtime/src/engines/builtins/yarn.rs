use crate::{Result, command, engines::traits::{EngineContext, ToolingEngine}};
use async_trait::async_trait;
use std::path::Path;
use worklens_core::{EngineKind, Repository, ToolStatus};

pub struct YarnEngine;

#[async_trait]
impl ToolingEngine for YarnEngine {
    fn id(&self) -> &str {
        "yarn"
    }
    fn name(&self) -> &str {
        "Yarn package manager"
    }
    fn kind(&self) -> EngineKind {
        EngineKind::PackageManager
    }
    fn binaries(&self) -> Vec<String> {
        vec!["yarn".into()]
    }
    fn manifest_patterns(&self) -> Vec<String> {
        vec!["yarn.lock".into(), ".yarnrc.yml".into()]
    }
    fn supported_actions(&self) -> Vec<String> {
        vec!["info".into(), "why".into()]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        Ok(root.join("yarn.lock").exists() || root.join(".yarnrc.yml").exists())
    }

    async fn diagnose(&self) -> ToolStatus {
        let output = command::run(&std::path::PathBuf::from("/"), "yarn", &["--version"]).await;
        let available = output.is_ok();
        let version = output
            .map(|v| String::from_utf8_lossy(&v).trim().to_owned())
            .unwrap_or_else(|e| e.to_string());
        ToolStatus {
            tool: "yarn".into(),
            available,
            version,
        }
    }

    async fn execute_action(
        &self,
        repo: &Repository,
        action: &str,
        params: &serde_json::Value,
        _context: &EngineContext,
    ) -> Result<serde_json::Value> {
        let root = Path::new(&repo.path);
        match action {
            "info" => {
                let pkg = params["package"].as_str().unwrap_or("");
                let out = command::run(root, "yarn", &["info", pkg, "--json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out).unwrap_or(serde_json::json!({ "raw": String::from_utf8_lossy(&out) }));
                Ok(val)
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported yarn action: {action}") })),
        }
    }
}
