use crate::{Result, command, engines::traits::{EngineContext, ToolingEngine}};
use async_trait::async_trait;
use std::path::Path;
use worklens_core::{EngineKind, Repository, ToolStatus};

pub struct NxEngine;

#[async_trait]
impl ToolingEngine for NxEngine {
    fn id(&self) -> &str {
        "nx"
    }
    fn name(&self) -> &str {
        "Nx monorepo build system"
    }
    fn kind(&self) -> EngineKind {
        EngineKind::BuildSystem
    }
    fn binaries(&self) -> Vec<String> {
        vec!["nx".into(), "pnpm".into(), "npx".into()]
    }
    fn manifest_patterns(&self) -> Vec<String> {
        vec!["nx.json".into(), "project.json".into()]
    }
    fn supported_actions(&self) -> Vec<String> {
        vec!["show_projects".into(), "affected".into(), "graph".into()]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        Ok(root.join("nx.json").exists())
    }

    async fn diagnose(&self) -> ToolStatus {
        let output = command::run(&std::path::PathBuf::from("/"), "nx", &["--version"]).await;
        let available = output.is_ok();
        let version = output
            .map(|v| String::from_utf8_lossy(&v).trim().to_owned())
            .unwrap_or_else(|e| e.to_string());
        ToolStatus {
            tool: "nx".into(),
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
            "show_projects" => {
                let out = command::run(root, "nx", &["show", "projects", "--json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "affected" => {
                let base = params["base"].as_str().unwrap_or("main");
                let head = params["head"].as_str().unwrap_or("HEAD");
                let out = command::run(root, "nx", &["show", "projects", "--affected", "--base", base, "--head", head, "--json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported nx action: {action}") })),
        }
    }
}
