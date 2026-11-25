use crate::Result;
use std::path::Path;
use worklens_core::{EngineKind, EngineRealtimeStatus, Graph, Repository, ToolStatus};

pub struct EngineContext<'a> {
    pub repo: &'a Repository,
    pub caller_id: String,
    pub extra_env: std::collections::HashMap<String, String>,
}

#[async_trait::async_trait]
pub trait ToolingEngine: Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn kind(&self) -> EngineKind;
    fn binaries(&self) -> Vec<String>;
    fn manifest_patterns(&self) -> Vec<String>;
    fn supported_actions(&self) -> Vec<String>;

    async fn detect(&self, root: &Path) -> Result<bool>;
    async fn diagnose(&self) -> ToolStatus;
    async fn collect_graph(&self, _repo: &Repository, _context: &EngineContext) -> Result<Option<Graph>> {
        Ok(None)
    }
    async fn collect_realtime_status(
        &self,
        _repo: Option<&Repository>,
    ) -> Result<Option<EngineRealtimeStatus>> {
        Ok(None)
    }
    async fn execute_action(
        &self,
        _repo: &Repository,
        _action: &str,
        _params: &serde_json::Value,
        _context: &EngineContext,
    ) -> Result<serde_json::Value> {
        Ok(serde_json::json!({ "unsupported": true }))
    }
}
