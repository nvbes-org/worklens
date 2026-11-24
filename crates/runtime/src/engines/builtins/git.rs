use crate::{Result, command, engines::traits::{EngineContext, ToolingEngine}};
use async_trait::async_trait;
use std::path::Path;
use worklens_core::{EngineKind, Repository, ToolStatus};

pub struct GitEngine;

#[async_trait]
impl ToolingEngine for GitEngine {
    fn id(&self) -> &str {
        "git"
    }
    fn name(&self) -> &str {
        "Git version control system"
    }
    fn kind(&self) -> EngineKind {
        EngineKind::Vcs
    }
    fn binaries(&self) -> Vec<String> {
        vec!["git".into()]
    }
    fn manifest_patterns(&self) -> Vec<String> {
        vec![".git".into(), ".gitmodules".into()]
    }
    fn supported_actions(&self) -> Vec<String> {
        vec!["status".into(), "log".into(), "diff".into()]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        Ok(root.join(".git").exists())
    }

    async fn diagnose(&self) -> ToolStatus {
        let output = command::run(&std::path::PathBuf::from("/"), "git", &["--version"]).await;
        let available = output.is_ok();
        let version = output
            .map(|v| String::from_utf8_lossy(&v).trim().to_owned())
            .unwrap_or_else(|e| e.to_string());
        ToolStatus {
            tool: "git".into(),
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
            "status" => {
                let out = command::run(root, "git", &["status", "--porcelain=v1"]).await?;
                Ok(serde_json::json!({ "status": String::from_utf8_lossy(&out) }))
            }
            "log" => {
                let out = command::run(root, "git", &["log", "-n", "10", "--oneline"]).await?;
                Ok(serde_json::json!({ "log": String::from_utf8_lossy(&out) }))
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported git action: {action}") })),
        }
    }
}
