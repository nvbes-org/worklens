use crate::{Result, command, engines::traits::{EngineContext, ToolingEngine}};
use async_trait::async_trait;
use std::path::Path;
use worklens_core::{EngineKind, Repository, ToolStatus};

pub struct IacEngine;

#[async_trait]
impl ToolingEngine for IacEngine {
    fn id(&self) -> &str {
        "terraform"
    }
    fn name(&self) -> &str {
        "Terraform & OpenTofu IaC engine"
    }
    fn kind(&self) -> EngineKind {
        EngineKind::IaC
    }
    fn binaries(&self) -> Vec<String> {
        vec!["tofu".into(), "terraform".into()]
    }
    fn manifest_patterns(&self) -> Vec<String> {
        vec!["*.tf".into(), "*.tofu".into(), ".terraform.lock.hcl".into()]
    }
    fn supported_actions(&self) -> Vec<String> {
        vec!["validate".into(), "show".into(), "plan".into()]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        if root.join(".terraform.lock.hcl").exists() {
            return Ok(true);
        }
        let mut entries = match tokio::fs::read_dir(root).await {
            Ok(e) => e,
            Err(_) => return Ok(false),
        };
        while let Ok(Some(entry)) = entries.next_entry().await {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".tf") || name.ends_with(".tofu") {
                return Ok(true);
            }
        }
        Ok(false)
    }

    async fn diagnose(&self) -> ToolStatus {
        for bin in ["tofu", "terraform"] {
            if let Ok(out) = command::run(&std::path::PathBuf::from("/"), bin, &["version"]).await {
                return ToolStatus {
                    tool: bin.into(),
                    available: true,
                    version: String::from_utf8_lossy(&out).lines().next().unwrap_or("").to_string(),
                };
            }
        }
        ToolStatus {
            tool: "terraform".into(),
            available: false,
            version: "Not found".into(),
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
        let bin = if command::run(&std::path::PathBuf::from("/"), "tofu", &["version"]).await.is_ok() {
            "tofu"
        } else {
            "terraform"
        };

        match action {
            "validate" => {
                let out = command::run(root, bin, &["validate", "-json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "show" => {
                let out = command::run(root, bin, &["show", "-json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported IaC action: {action}") })),
        }
    }
}
