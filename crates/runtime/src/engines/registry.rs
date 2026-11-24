use super::traits::{EngineContext, ToolingEngine};
use crate::{Result, error, permissions::PermissionManager};
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, RwLock},
};
use worklens_core::{EngineInfo, Repository};

#[derive(Clone)]
pub struct EngineRegistry {
    engines: Arc<RwLock<HashMap<String, Arc<dyn ToolingEngine>>>>,
}

impl Default for EngineRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl EngineRegistry {
    pub fn new() -> Self {
        Self {
            engines: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn register(&self, engine: Arc<dyn ToolingEngine>) {
        let mut map = self.engines.write().unwrap();
        map.insert(engine.id().to_string(), engine);
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn ToolingEngine>> {
        self.engines.read().unwrap().get(id).cloned()
    }

    pub async fn list(&self) -> Vec<EngineInfo> {
        let engines = {
            let map = self.engines.read().unwrap();
            map.values().cloned().collect::<Vec<_>>()
        };

        let mut infos = Vec::new();
        for engine in engines {
            let diag = engine.diagnose().await;
            infos.push(EngineInfo {
                id: engine.id().to_string(),
                name: engine.name().to_string(),
                kind: engine.kind(),
                plugin_id: None,
                binaries: engine.binaries(),
                available: diag.available,
                version: diag.version,
                manifest_patterns: engine.manifest_patterns(),
                supported_actions: engine.supported_actions(),
            });
        }
        infos
    }

    pub async fn detect_for_repo(&self, root: &Path) -> Vec<Arc<dyn ToolingEngine>> {
        let engines = {
            let map = self.engines.read().unwrap();
            map.values().cloned().collect::<Vec<_>>()
        };
        let mut detected = Vec::new();
        for engine in engines {
            if let Ok(true) = engine.detect(root).await {
                detected.push(engine);
            }
        }
        detected
    }

    pub async fn execute(
        &self,
        engine_id: &str,
        action: &str,
        params: &serde_json::Value,
        repo: &Repository,
        caller_id: &str,
        permissions: &PermissionManager,
    ) -> Result<serde_json::Value> {
        let engine = self
            .get(engine_id)
            .ok_or_else(|| error(format!("Engine '{engine_id}' not found")))?;

        let binaries = engine.binaries();
        let primary_binary = binaries.first().cloned().unwrap_or_else(|| engine_id.to_string());

        let args = vec![action.to_string()];
        let is_mutating = matches!(
            action,
            "apply"
                | "build"
                | "install"
                | "run"
                | "commit"
                | "push"
                | "deploy"
                | "start"
                | "stop"
                | "restart"
                | "delete"
                | "prune"
                | "switch-context"
                | "up"
        );

        // Mediated through the PermissionManager capability evaluator
        permissions.check_exec(caller_id, &primary_binary, &args, is_mutating, repo.trusted)?;

        let context = EngineContext {
            repo,
            caller_id: caller_id.to_string(),
            extra_env: HashMap::new(),
        };

        engine.execute_action(repo, action, params, &context).await
    }

    pub async fn realtime_list(
        &self,
        repo: Option<&Repository>,
    ) -> Vec<worklens_core::EngineRealtimeStatus> {
        let engines = {
            let map = self.engines.read().unwrap();
            map.values().cloned().collect::<Vec<_>>()
        };

        let mut set = tokio::task::JoinSet::new();
        for engine in engines {
            let repo_cloned = repo.cloned();
            set.spawn(async move {
                match tokio::time::timeout(
                    std::time::Duration::from_secs(8),
                    engine.collect_realtime_status(repo_cloned.as_ref()),
                )
                .await
                {
                    Ok(Ok(Some(status))) => Some(status),
                    _ => None,
                }
            });
        }

        let mut results = Vec::new();
        while let Some(res) = set.join_next().await {
            if let Ok(Some(status)) = res {
                results.push(status);
            }
        }
        results.sort_by(|a, b| a.engine_id.cmp(&b.engine_id));
        results
    }

    pub async fn realtime_status(
        &self,
        engine_id: &str,
        repo: Option<&Repository>,
    ) -> Result<worklens_core::EngineRealtimeStatus> {
        let engine = self
            .get(engine_id)
            .ok_or_else(|| error(format!("Engine '{engine_id}' not found")))?;

        match tokio::time::timeout(
            std::time::Duration::from_secs(5),
            engine.collect_realtime_status(repo),
        )
        .await
        {
            Ok(Ok(Some(status))) => Ok(status),
            Ok(Ok(None)) => Ok(worklens_core::EngineRealtimeStatus {
                engine_id: engine.id().to_string(),
                engine_name: engine.name().to_string(),
                kind: engine.kind(),
                available: false,
                is_running: false,
                version: "N/A".into(),
                endpoint_or_context: "none".into(),
                instances: Vec::new(),
                summary: "No realtime status provider for this engine".into(),
                updated_at: worklens_core::now(),
            }),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(error(format!("Timeout collecting realtime status for {engine_id}"))),
        }
    }
}
