use crate::{Result, command, engines::traits::{EngineContext, ToolingEngine}};
use async_trait::async_trait;
use std::path::Path;
use worklens_core::{EngineKind, Repository, ToolStatus};

pub struct GhEngine;

#[async_trait]
impl ToolingEngine for GhEngine {
    fn id(&self) -> &str {
        "gh"
    }
    fn name(&self) -> &str {
        "GitHub CLI"
    }
    fn kind(&self) -> EngineKind {
        EngineKind::CloudCli
    }
    fn binaries(&self) -> Vec<String> {
        vec!["gh".into()]
    }
    fn manifest_patterns(&self) -> Vec<String> {
        vec![".github".into()]
    }
    fn supported_actions(&self) -> Vec<String> {
        vec!["pr_list".into(), "issue_list".into(), "run_list".into()]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        Ok(root.join(".github").exists())
    }

    async fn diagnose(&self) -> ToolStatus {
        let output = command::run(&std::path::PathBuf::from("/"), "gh", &["--version"]).await;
        let available = output.is_ok();
        let version = output
            .map(|v| String::from_utf8_lossy(&v).trim().to_owned())
            .unwrap_or_else(|e| e.to_string());
        ToolStatus {
            tool: "gh".into(),
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
            "pr_list" => {
                let out = command::run(root, "gh", &["pr", "list", "--json", "number,title,state,author,url"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "issue_list" => {
                let out = command::run(root, "gh", &["issue", "list", "--json", "number,title,state,author,url"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported gh action: {action}") })),
        }
    }
}
