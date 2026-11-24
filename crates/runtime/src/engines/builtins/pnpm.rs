use crate::{Result, command, engines::traits::{EngineContext, ToolingEngine}};
use async_trait::async_trait;
use std::path::Path;
use worklens_core::{EngineKind, Repository, ToolStatus};

pub struct PnpmEngine;

#[async_trait]
impl ToolingEngine for PnpmEngine {
    fn id(&self) -> &str {
        "pnpm"
    }
    fn name(&self) -> &str {
        "pnpm package manager"
    }
    fn kind(&self) -> EngineKind {
        EngineKind::PackageManager
    }
    fn binaries(&self) -> Vec<String> {
        vec!["pnpm".into()]
    }
    fn manifest_patterns(&self) -> Vec<String> {
        vec!["pnpm-workspace.yaml".into(), "pnpm-lock.yaml".into()]
    }
    fn supported_actions(&self) -> Vec<String> {
        vec!["list".into(), "outdated".into(), "audit".into()]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        Ok(root.join("pnpm-workspace.yaml").exists() || root.join("pnpm-lock.yaml").exists())
    }

    async fn diagnose(&self) -> ToolStatus {
        let output = command::run(&std::path::PathBuf::from("/"), "pnpm", &["--version"]).await;
        let available = output.is_ok();
        let version = output
            .map(|v| String::from_utf8_lossy(&v).trim().to_owned())
            .unwrap_or_else(|e| e.to_string());
        ToolStatus {
            tool: "pnpm".into(),
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
            "list" => {
                let out = command::run(root, "pnpm", &["list", "--json", "--depth", "1"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "audit" => {
                let out = command::run(root, "pnpm", &["audit", "--json"]).await.unwrap_or_default();
                let val: serde_json::Value = serde_json::from_slice(&out).unwrap_or(serde_json::json!({ "raw": String::from_utf8_lossy(&out) }));
                Ok(val)
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported pnpm action: {action}") })),
        }
    }
}
