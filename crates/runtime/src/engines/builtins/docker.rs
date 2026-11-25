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

pub struct DockerEngine;

#[async_trait]
impl ToolingEngine for DockerEngine {
    fn id(&self) -> &str {
        "docker"
    }

    fn name(&self) -> &str {
        "Docker Container Engine"
    }

    fn kind(&self) -> EngineKind {
        EngineKind::Container
    }

    fn binaries(&self) -> Vec<String> {
        vec!["docker".into()]
    }

    fn manifest_patterns(&self) -> Vec<String> {
        vec![
            "Dockerfile".into(),
            "docker-compose.yml".into(),
            "docker-compose.yaml".into(),
            "compose.yml".into(),
            "compose.yaml".into(),
            ".dockerignore".into(),
        ]
    }

    fn supported_actions(&self) -> Vec<String> {
        vec![
            "ps".into(),
            "stats".into(),
            "start".into(),
            "stop".into(),
            "restart".into(),
            "logs".into(),
            "inspect".into(),
            "prune".into(),
        ]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        for pattern in self.manifest_patterns() {
            if root.join(&pattern).exists() {
                return Ok(true);
            }
        }
        if Path::new("/var/run/docker.sock").exists() {
            return Ok(true);
        }
        Ok(false)
    }

    async fn diagnose(&self) -> ToolStatus {
        let output = command::run(&PathBuf::from("/"), "docker", &["--version"]).await;
        let available = output.is_ok();
        let version = output
            .map(|v| String::from_utf8_lossy(&v).trim().to_owned())
            .unwrap_or_else(|e| e.to_string());
        ToolStatus {
            tool: "docker".into(),
            available,
            version,
        }
    }

    async fn collect_realtime_status(
        &self,
        repo: Option<&Repository>,
    ) -> Result<Option<EngineRealtimeStatus>> {
        let diag = self.diagnose().await;
        let root = repo.map(|r| PathBuf::from(&r.path)).unwrap_or_else(|| PathBuf::from("/"));

        if !diag.available {
            return Ok(Some(EngineRealtimeStatus {
                engine_id: self.id().to_string(),
                engine_name: self.name().to_string(),
                kind: self.kind(),
                available: false,
                is_running: false,
                version: diag.version,
                endpoint_or_context: "/var/run/docker.sock".into(),
                instances: Vec::new(),
                summary: "Docker CLI not found on system PATH".into(),
                updated_at: worklens_core::now(),
            }));
        }

        // Check if daemon is active
        let ping = command::run(&root, "docker", &["info", "--format", "{{.ServerVersion}}"]).await;
        let is_running = ping.is_ok();
        let daemon_version = ping
            .map(|v| String::from_utf8_lossy(&v).trim().to_string())
            .unwrap_or_else(|_| "Daemon unreachable".into());

        if !is_running {
            return Ok(Some(EngineRealtimeStatus {
                engine_id: self.id().to_string(),
                engine_name: self.name().to_string(),
                kind: self.kind(),
                available: true,
                is_running: false,
                version: diag.version,
                endpoint_or_context: "/var/run/docker.sock".into(),
                instances: Vec::new(),
                summary: format!("Docker daemon offline or unresponsive ({daemon_version})"),
                updated_at: worklens_core::now(),
            }));
        }

        let ps_out = command::run(
            &root,
            "docker",
            &[
                "ps",
                "-a",
                "--format",
                "{{json .}}",
            ],
        )
        .await;

        let mut instances = Vec::new();
        if let Ok(bytes) = ps_out {
            let text = String::from_utf8_lossy(&bytes);
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let id = val["ID"].as_str().or_else(|| val["Id"].as_str()).unwrap_or("").to_string();
                    let name = val["Names"].as_str().unwrap_or("").to_string();
                    let status = val["Status"].as_str().or_else(|| val["State"].as_str()).unwrap_or("").to_string();
                    let image = val["Image"].as_str().unwrap_or("").to_string();
                    let created = val["CreatedAt"].as_str().or_else(|| val["Created"].as_str()).unwrap_or("").to_string();
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

        // Attempt non-blocking stats collection for active containers
        if !instances.is_empty() {
            if let Ok(stats_bytes) = command::run(
                &root,
                "docker",
                &["stats", "--no-stream", "--format", "{{json .}}"],
            )
            .await
            {
                let stats_str = String::from_utf8_lossy(&stats_bytes);
                for line in stats_str.lines() {
                    let trimmed = line.trim();
                    if let Ok(sval) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        let cid = sval["ID"].as_str().or_else(|| sval["Container"].as_str()).unwrap_or("");
                        let cpu_str = sval["CPUPerc"].as_str().unwrap_or("0%");
                        let cpu = cpu_str.trim_end_matches('%').parse::<f64>().ok();

                        for inst in &mut instances {
                            if inst.id.starts_with(cid) || (!cid.is_empty() && cid.starts_with(&inst.id)) {
                                inst.cpu_percent = cpu;
                            }
                        }
                    }
                }
            }
        }

        let running_count = instances.iter().filter(|i| i.status.to_lowercase().contains("up") || i.status.to_lowercase().contains("running")).count();
        let summary = format!("{}/{} containers running (v{})", running_count, instances.len(), daemon_version);

        Ok(Some(EngineRealtimeStatus {
            engine_id: self.id().to_string(),
            engine_name: self.name().to_string(),
            kind: self.kind(),
            available: true,
            is_running: true,
            version: daemon_version,
            endpoint_or_context: "/var/run/docker.sock".into(),
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
        let cid = params["containerId"].as_str().unwrap_or("");

        match action {
            "ps" => {
                let out = command::run(root, "docker", &["ps", "-a", "--format", "{{json .}}"]).await?;
                let text = String::from_utf8_lossy(&out);
                let list: Vec<serde_json::Value> = text
                    .lines()
                    .filter_map(|l| serde_json::from_str(l.trim()).ok())
                    .collect();
                Ok(serde_json::to_value(list)?)
            }
            "stats" => {
                let out = command::run(root, "docker", &["stats", "--no-stream", "--format", "{{json .}}"]).await?;
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
                let out = command::run(root, "docker", &["start", cid]).await?;
                Ok(serde_json::json!({ "started": cid, "output": String::from_utf8_lossy(&out).trim() }))
            }
            "stop" => {
                if cid.is_empty() {
                    return Err(crate::error("Missing containerId param"));
                }
                let out = command::run(root, "docker", &["stop", cid]).await?;
                Ok(serde_json::json!({ "stopped": cid, "output": String::from_utf8_lossy(&out).trim() }))
            }
            "restart" => {
                if cid.is_empty() {
                    return Err(crate::error("Missing containerId param"));
                }
                let out = command::run(root, "docker", &["restart", cid]).await?;
                Ok(serde_json::json!({ "restarted": cid, "output": String::from_utf8_lossy(&out).trim() }))
            }
            "logs" => {
                if cid.is_empty() {
                    return Err(crate::error("Missing containerId param"));
                }
                let out = command::run(root, "docker", &["logs", "--tail", "100", cid]).await?;
                Ok(serde_json::json!({ "containerId": cid, "logs": String::from_utf8_lossy(&out) }))
            }
            "inspect" => {
                if cid.is_empty() {
                    return Err(crate::error("Missing containerId param"));
                }
                let out = command::run(root, "docker", &["inspect", cid]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "prune" => {
                let out = command::run(root, "docker", &["container", "prune", "-f"]).await?;
                Ok(serde_json::json!({ "output": String::from_utf8_lossy(&out).trim() }))
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported Docker action: {action}") })),
        }
    }
}
