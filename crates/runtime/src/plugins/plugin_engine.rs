use crate::{
    command,
    engines::traits::{EngineContext, ToolingEngine},
    Result,
};
use async_trait::async_trait;
use std::path::Path;
use worklens_core::{EngineKind, PluginEngineDecl, Repository, ToolStatus};

pub struct DynamicPluginEngine {
    decl: PluginEngineDecl,
    plugin_id: String,
}

impl DynamicPluginEngine {
    pub fn new(plugin_id: String, decl: PluginEngineDecl) -> Self {
        Self { decl, plugin_id }
    }

    pub fn plugin_id(&self) -> &str {
        &self.plugin_id
    }
}

#[async_trait]
impl ToolingEngine for DynamicPluginEngine {
    fn id(&self) -> &str {
        &self.decl.id
    }

    fn name(&self) -> &str {
        &self.decl.name
    }

    fn kind(&self) -> EngineKind {
        self.decl.kind.clone()
    }

    fn binaries(&self) -> Vec<String> {
        self.decl.binaries.clone()
    }

    fn manifest_patterns(&self) -> Vec<String> {
        self.decl.manifest_patterns.clone()
    }

    fn supported_actions(&self) -> Vec<String> {
        self.decl.supported_actions.clone()
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        for pattern in &self.decl.manifest_patterns {
            if root.join(pattern).exists() {
                return Ok(true);
            }
        }
        Ok(false)
    }

    async fn diagnose(&self) -> ToolStatus {
        let first_bin = self
            .decl
            .binaries
            .first()
            .cloned()
            .unwrap_or_else(|| self.decl.id.clone());
        let output = command::run(&std::path::PathBuf::from("/"), &first_bin, &["--version"]).await;
        let available = output.is_ok();
        let version = output
            .map(|v| String::from_utf8_lossy(&v).trim().to_owned())
            .unwrap_or_else(|_| "Unavailable".to_string());
        ToolStatus {
            tool: first_bin,
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
        let first_bin = self
            .decl
            .binaries
            .first()
            .cloned()
            .unwrap_or_else(|| self.decl.id.clone());

        let args: Vec<String> = if let Some(arr) = params["args"].as_array() {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        } else {
            vec![action.to_string()]
        };

        let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let output = command::run(root, &first_bin, &arg_refs).await?;
        let text = String::from_utf8_lossy(&output).into_owned();

        if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&text) {
            Ok(json_val)
        } else {
            Ok(serde_json::json!({
                "stdout": text,
                "action": action,
                "engine": self.decl.id,
            }))
        }
    }
}
