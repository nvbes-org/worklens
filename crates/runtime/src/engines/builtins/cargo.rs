use crate::{Result, command, engines::traits::{EngineContext, ToolingEngine}};
use async_trait::async_trait;
use std::path::Path;
use worklens_core::{EngineKind, Repository, ToolStatus};

pub struct CargoEngine;

#[async_trait]
impl ToolingEngine for CargoEngine {
    fn id(&self) -> &str {
        "cargo"
    }
    fn name(&self) -> &str {
        "Cargo build system and package manager"
    }
    fn kind(&self) -> EngineKind {
        EngineKind::BuildSystem
    }
    fn binaries(&self) -> Vec<String> {
        vec!["cargo".into(), "rustc".into()]
    }
    fn manifest_patterns(&self) -> Vec<String> {
        vec!["Cargo.toml".into(), "Cargo.lock".into()]
    }
    fn supported_actions(&self) -> Vec<String> {
        vec!["metadata".into(), "check".into(), "tree".into()]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        Ok(root.join("Cargo.toml").exists())
    }

    async fn diagnose(&self) -> ToolStatus {
        let output = command::run(&std::path::PathBuf::from("/"), "cargo", &["--version"]).await;
        let available = output.is_ok();
        let version = output
            .map(|v| String::from_utf8_lossy(&v).trim().to_owned())
            .unwrap_or_else(|e| e.to_string());
        ToolStatus {
            tool: "cargo".into(),
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
            "metadata" => {
                let out = command::run(root, "cargo", &["metadata", "--format-version", "1", "--no-deps"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "check" => {
                let out = command::run(root, "cargo", &["check", "--message-format=json"]).await?;
                Ok(serde_json::json!({ "output": String::from_utf8_lossy(&out) }))
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported cargo action: {action}") })),
        }
    }
}
