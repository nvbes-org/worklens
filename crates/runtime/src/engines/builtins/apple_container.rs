use crate::{
    command,
    engines::traits::{EngineContext, ToolingEngine},
    Result,
};
use async_trait::async_trait;
use std::path::{Path, PathBuf};
use worklens_core::{
    EngineKind, EngineRealtimeInstance, EngineRealtimeStatus, Repository, ToolStatus,
};

pub struct AppleContainerEngine;

impl AppleContainerEngine {
    async fn find_binary(&self) -> Option<&'static str> {
        for bin in ["colima", "tart", "containerd"] {
            if command::run(&PathBuf::from("/"), bin, &["--version"]).await.is_ok() {
                return Some(bin);
            }
        }
        None
    }
}

#[async_trait]
impl ToolingEngine for AppleContainerEngine {
    fn id(&self) -> &str {
        "apple-container"
    }

    fn name(&self) -> &str {
        "Apple Container & Virtualization Engine (Colima / Tart / VZ)"
    }

    fn kind(&self) -> EngineKind {
        EngineKind::Container
    }

    fn binaries(&self) -> Vec<String> {
        vec!["colima".into(), "tart".into(), "containerd".into()]
    }

    fn manifest_patterns(&self) -> Vec<String> {
        vec![
            ".colima".into(),
            "tart.yml".into(),
            "Virtualfile".into(),
        ]
    }

    fn supported_actions(&self) -> Vec<String> {
        vec![
            "status".into(),
            "list".into(),
            "start".into(),
            "stop".into(),
            "restart".into(),
            "logs".into(),
        ]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        for pattern in self.manifest_patterns() {
            if root.join(&pattern).exists() {
                return Ok(true);
            }
        }
        if cfg!(target_os = "macos") && self.find_binary().await.is_some() {
            return Ok(true);
        }
        Ok(false)
    }

    async fn diagnose(&self) -> ToolStatus {
        if let Some(bin) = self.find_binary().await {
            let out = command::run(&PathBuf::from("/"), bin, &["--version"]).await;
            let version = out
                .map(|v| String::from_utf8_lossy(&v).trim().to_string())
                .unwrap_or_else(|e| e.to_string());
            ToolStatus {
                tool: bin.into(),
                available: true,
                version,
            }
        } else {
            ToolStatus {
                tool: "colima".into(),
                available: false,
                version: "Apple virtualization tool (colima/tart) not found".into(),
            }
        }
    }

    async fn collect_realtime_status(
        &self,
        repo: Option<&Repository>,
    ) -> Result<Option<EngineRealtimeStatus>> {
        let root = repo.map(|r| PathBuf::from(&r.path)).unwrap_or_else(|| PathBuf::from("/"));
        let bin = match self.find_binary().await {
            Some(b) => b,
            None => {
                return Ok(Some(EngineRealtimeStatus {
                    engine_id: self.id().to_string(),
                    engine_name: self.name().to_string(),
                    kind: self.kind(),
                    available: false,
                    is_running: false,
                    version: "Not found".into(),
                    endpoint_or_context: "apple://vz".into(),
                    instances: Vec::new(),
                    summary: "Apple Virtualization container engine not installed".into(),
                    updated_at: worklens_core::now(),
                }));
            }
        };

        let ver_out = command::run(&root, bin, &["--version"]).await;
        let version_str = ver_out
            .map(|v| String::from_utf8_lossy(&v).trim().to_string())
            .unwrap_or_else(|_| "Unknown version".into());

        let mut instances = Vec::new();
        let mut is_running = false;

        if bin == "colima" {
            let list_out = command::run(&root, "colima", &["list", "--json"]).await;
            if let Ok(bytes) = list_out {
                let text = String::from_utf8_lossy(&bytes);
                for line in text.lines() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        let name = val["name"].as_str().unwrap_or("default").to_string();
                        let status = val["status"].as_str().unwrap_or("stopped").to_string();
                        let cpus = val["cpus"].as_u64();
                        let mem = val["memory"].as_u64();
                        let arch = val["arch"].as_str().unwrap_or("aarch64");
                        if status.eq_ignore_ascii_case("running") {
                            is_running = true;
                        }

                        instances.push(EngineRealtimeInstance {
                            id: format!("colima-{name}"),
                            name: format!("Colima ({name})"),
                            status,
                            image: format!("Apple VZ ({arch})"),
                            created_at: "".into(),
                            ports: Vec::new(),
                            cpu_percent: cpus.map(|c| c as f64 * 10.0),
                            memory_usage_bytes: None,
                            memory_limit_bytes: mem.map(|m| m * 1024 * 1024 * 1024),
                        });
                    }
                }
            } else if let Ok(status_bytes) = command::run(&root, "colima", &["status"]).await {
                let text = String::from_utf8_lossy(&status_bytes);
                let running = text.contains("running");
                is_running = running;
                instances.push(EngineRealtimeInstance {
                    id: "colima-default".into(),
                    name: "Colima default instance".into(),
                    status: if running { "Running".into() } else { "Stopped".into() },
                    image: "Apple Virtualization.framework".into(),
                    created_at: "".into(),
                    ports: Vec::new(),
                    cpu_percent: None,
                    memory_usage_bytes: None,
                    memory_limit_bytes: None,
                });
            }
        } else if bin == "tart" {
            if let Ok(bytes) = command::run(&root, "tart", &["list", "--format", "json"]).await {
                let text = String::from_utf8_lossy(&bytes);
                if let Ok(val) = serde_json::from_str::<Vec<serde_json::Value>>(&text) {
                    for v in val {
                        let name = v["name"].as_str().unwrap_or("").to_string();
                        let running = v["running"].as_bool().unwrap_or(false);
                        if running {
                            is_running = true;
                        }
                        instances.push(EngineRealtimeInstance {
                            id: format!("tart-{name}"),
                            name,
                            status: if running { "Running".into() } else { "Stopped".into() },
                            image: "Tart macOS VM".into(),
                            created_at: "".into(),
                            ports: Vec::new(),
                            cpu_percent: None,
                            memory_usage_bytes: None,
                            memory_limit_bytes: None,
                        });
                    }
                }
            }
        }

        let summary = format!("{}/{} Apple virtualization VMs active ({})", instances.iter().filter(|i| i.status.eq_ignore_ascii_case("running")).count(), instances.len(), bin);

        Ok(Some(EngineRealtimeStatus {
            engine_id: self.id().to_string(),
            engine_name: self.name().to_string(),
            kind: self.kind(),
            available: true,
            is_running,
            version: version_str,
            endpoint_or_context: format!("apple://{bin}"),
            instances,
            summary,
            updated_at: worklens_core::now(),
        }))
    }

    async fn execute_action(
        &self,
        repo: &Repository,
        action: &str,
        params: &serde_json::Value,
        _context: &EngineContext,
    ) -> Result<serde_json::Value> {
        let root = Path::new(&repo.path);
        let bin = self.find_binary().await.unwrap_or("colima");
        let name = params["name"].as_str().unwrap_or("default");

        match action {
            "status" => {
                let out = command::run(root, bin, &["status"]).await?;
                Ok(serde_json::json!({ "status": String::from_utf8_lossy(&out).trim() }))
            }
            "list" => {
                let out = if bin == "colima" {
                    command::run(root, "colima", &["list", "--json"]).await?
                } else {
                    command::run(root, "tart", &["list"]).await?
                };
                Ok(serde_json::json!({ "output": String::from_utf8_lossy(&out).trim() }))
            }
            "start" => {
                let out = if bin == "colima" {
                    command::run(root, "colima", &["start", name]).await?
                } else {
                    command::run(root, "tart", &["run", name]).await?
                };
                Ok(serde_json::json!({ "started": name, "output": String::from_utf8_lossy(&out).trim() }))
            }
            "stop" => {
                let out = if bin == "colima" {
                    command::run(root, "colima", &["stop", name]).await?
                } else {
                    command::run(root, "tart", &["stop", name]).await?
                };
                Ok(serde_json::json!({ "stopped": name, "output": String::from_utf8_lossy(&out).trim() }))
            }
            "restart" => {
                let out = if bin == "colima" {
                    command::run(root, "colima", &["restart", name]).await?
                } else {
                    command::run(root, "tart", &["stop", name]).await?;
                    command::run(root, "tart", &["run", name]).await?
                };
                Ok(serde_json::json!({ "restarted": name, "output": String::from_utf8_lossy(&out).trim() }))
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported Apple container action: {action}") })),
        }
    }
}
