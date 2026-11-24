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

pub struct OciEngine;

impl OciEngine {
    async fn find_binary(&self) -> Option<&'static str> {
        for bin in ["podman", "nerdctl", "crun"] {
            if command::run(&PathBuf::from("/"), bin, &["--version"]).await.is_ok() {
                return Some(bin);
            }
        }
        None
    }
}

#[async_trait]
impl ToolingEngine for OciEngine {
    fn id(&self) -> &str {
        "oci"
    }

    fn name(&self) -> &str {
        "OCI Container Engine (Podman / nerdctl)"
    }

    fn kind(&self) -> EngineKind {
        EngineKind::Container
    }

    fn binaries(&self) -> Vec<String> {
        vec!["podman".into(), "nerdctl".into(), "crun".into()]
    }

    fn manifest_patterns(&self) -> Vec<String> {
        vec![
            "Containerfile".into(),
            "Containerfile.dev".into(),
            "podman-compose.yml".into(),
            "oci-spec.json".into(),
        ]
    }

    fn supported_actions(&self) -> Vec<String> {
        vec![
            "ps".into(),
            "pod-ps".into(),
            "stats".into(),
            "start".into(),
            "stop".into(),
            "restart".into(),
            "logs".into(),
            "inspect".into(),
        ]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        for pattern in self.manifest_patterns() {
            if root.join(&pattern).exists() {
                return Ok(true);
            }
        }
        Ok(self.find_binary().await.is_some())
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
                tool: "podman".into(),
                available: false,
                version: "Neither podman nor nerdctl found".into(),
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
                    endpoint_or_context: "oci://default".into(),
                    instances: Vec::new(),
                    summary: "No OCI container runtime (podman / nerdctl) found".into(),
                    updated_at: worklens_core::now(),
                }));
            }
        };

        let ver_out = command::run(&root, bin, &["--version"]).await;
        let version_str = ver_out
            .map(|v| String::from_utf8_lossy(&v).trim().to_string())
            .unwrap_or_else(|_| "Unknown version".into());

        let ps_out = command::run(&root, bin, &["ps", "-a", "--format", "{{json .}}"]).await;

        let mut instances = Vec::new();
        let is_running = ps_out.is_ok();

        if let Ok(bytes) = ps_out {
            let text = String::from_utf8_lossy(&bytes);
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let id = val["Id"].as_str().or_else(|| val["ID"].as_str()).unwrap_or("").to_string();
                    let name = val["Names"].as_str().or_else(|| val["Name"].as_str()).unwrap_or("").to_string();
                    let status = val["Status"].as_str().or_else(|| val["State"].as_str()).unwrap_or("").to_string();
                    let image = val["Image"].as_str().unwrap_or("").to_string();
                    let created = val["Created"].as_str().or_else(|| val["CreatedAt"].as_str()).unwrap_or("").to_string();
                    let ports_raw = val["Ports"].as_str().unwrap_or("");
                    let ports = if ports_raw.is_empty() {
                        Vec::new()
                    } else {
                        ports_raw.split(',').map(|s| s.trim().to_string()).collect()
                    };

                    instances.push(EngineRealtimeInstance {
                        id,
                        name,
                        status,
                        image,
                        created_at: created,
                        ports,
                        cpu_percent: None,
                        memory_usage_bytes: None,
                        memory_limit_bytes: None,
                    });
                }
            }
        }

        let running_count = instances.iter().filter(|i| i.status.to_lowercase().contains("up") || i.status.to_lowercase().contains("running")).count();
        let summary = format!("{}/{} OCI containers active ({})", running_count, instances.len(), bin);

        Ok(Some(EngineRealtimeStatus {
            engine_id: self.id().to_string(),
            engine_name: self.name().to_string(),
            kind: self.kind(),
            available: true,
            is_running,
            version: version_str,
            endpoint_or_context: format!("oci://{bin}"),
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
        let bin = self.find_binary().await.unwrap_or("podman");
        let cid = params["containerId"].as_str().unwrap_or("");

        match action {
            "ps" => {
                let out = command::run(root, bin, &["ps", "-a", "--format", "{{json .}}"]).await?;
                let text = String::from_utf8_lossy(&out);
                let list: Vec<serde_json::Value> = text
                    .lines()
                    .filter_map(|l| serde_json::from_str(l.trim()).ok())
                    .collect();
                Ok(serde_json::to_value(list)?)
            }
            "pod-ps" => {
                let out = command::run(root, bin, &["pod", "ps", "--format", "{{json .}}"]).await?;
                let text = String::from_utf8_lossy(&out);
                let list: Vec<serde_json::Value> = text
                    .lines()
                    .filter_map(|l| serde_json::from_str(l.trim()).ok())
                    .collect();
                Ok(serde_json::to_value(list)?)
            }
            "stats" => {
                let out = command::run(root, bin, &["stats", "--no-stream", "--format", "{{json .}}"]).await?;
                let text = String::from_utf8_lossy(&out);
                let list: Vec<serde_json::Value> = text
                    .lines()
                    .filter_map(|l| serde_json::from_str(l.trim()).ok())
                    .collect();
                Ok(serde_json::to_value(list)?)
            }
            "start" => {
                if cid.is_empty() {
                    return Err(crate::error("Missing containerId param"));
                }
                let out = command::run(root, bin, &["start", cid]).await?;
                Ok(serde_json::json!({ "started": cid, "output": String::from_utf8_lossy(&out).trim() }))
            }
            "stop" => {
                if cid.is_empty() {
                    return Err(crate::error("Missing containerId param"));
                }
                let out = command::run(root, bin, &["stop", cid]).await?;
                Ok(serde_json::json!({ "stopped": cid, "output": String::from_utf8_lossy(&out).trim() }))
            }
            "restart" => {
                if cid.is_empty() {
                    return Err(crate::error("Missing containerId param"));
                }
                let out = command::run(root, bin, &["restart", cid]).await?;
                Ok(serde_json::json!({ "restarted": cid, "output": String::from_utf8_lossy(&out).trim() }))
            }
            "logs" => {
                if cid.is_empty() {
                    return Err(crate::error("Missing containerId param"));
                }
                let out = command::run(root, bin, &["logs", "--tail", "100", cid]).await?;
                Ok(serde_json::json!({ "containerId": cid, "logs": String::from_utf8_lossy(&out) }))
            }
            "inspect" => {
                if cid.is_empty() {
                    return Err(crate::error("Missing containerId param"));
                }
                let out = command::run(root, bin, &["inspect", cid]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported OCI action: {action}") })),
        }
    }
}
