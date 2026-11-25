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

pub struct DevcontainerEngine;

impl DevcontainerEngine {
    fn find_config_file(root: &Path) -> Option<PathBuf> {
        let candidates = [
            root.join(".devcontainer/devcontainer.json"),
            root.join(".devcontainer.json"),
        ];
        for candidate in candidates {
            if candidate.exists() {
                return Some(candidate);
            }
        }
        None
    }
}

#[async_trait]
impl ToolingEngine for DevcontainerEngine {
    fn id(&self) -> &str {
        "devcontainer"
    }

    fn name(&self) -> &str {
        "Dev Container Engine"
    }

    fn kind(&self) -> EngineKind {
        EngineKind::Container
    }

    fn binaries(&self) -> Vec<String> {
        vec!["devcontainer".into()]
    }

    fn manifest_patterns(&self) -> Vec<String> {
        vec![
            ".devcontainer/devcontainer.json".into(),
            ".devcontainer.json".into(),
        ]
    }

    fn supported_actions(&self) -> Vec<String> {
        vec![
            "read-configuration".into(),
            "up".into(),
            "build".into(),
            "stop".into(),
            "logs".into(),
        ]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        if Self::find_config_file(root).is_some() {
            return Ok(true);
        }
        let out = command::run(&PathBuf::from("/"), "devcontainer", &["--version"]).await;
        Ok(out.is_ok())
    }

    async fn diagnose(&self) -> ToolStatus {
        let output = command::run(&PathBuf::from("/"), "devcontainer", &["--version"]).await;
        let available = output.is_ok();
        let version = output
            .map(|v| String::from_utf8_lossy(&v).trim().to_string())
            .unwrap_or_else(|e| e.to_string());
        ToolStatus {
            tool: "devcontainer".into(),
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
        let config_file = Self::find_config_file(&root);

        let mut config_name = "Devcontainer".to_string();
        let mut image_name = "default".to_string();
        let mut ports = Vec::new();

        if let Some(cfg_path) = &config_file {
            if let Ok(content) = tokio::fs::read_to_string(cfg_path).await {
                // Strip comments if any or parse as relaxed json
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(n) = val["name"].as_str() {
                        config_name = n.to_string();
                    }
                    if let Some(img) = val["image"].as_str() {
                        image_name = img.to_string();
                    } else if val["dockerFile"].is_string() || val["build"].is_object() {
                        image_name = "Dockerfile / Custom build".to_string();
                    }
                    if let Some(fp) = val["forwardPorts"].as_array() {
                        for p in fp {
                            ports.push(p.to_string());
                        }
                    }
                }
            }
        }

        // Check if there is an active container matching this workspace folder
        let mut instances = Vec::new();
        let mut is_running = false;

        let ps_check = command::run(
            &root,
            "docker",
            &[
                "ps",
                "-a",
                "--filter",
                &format!("label=devcontainer.local_folder={}", root.to_string_lossy()),
                "--format",
                "{{json .}}",
            ],
        )
        .await;

        if let Ok(bytes) = ps_check {
            let text = String::from_utf8_lossy(&bytes);
            for line in text.lines() {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                    let id = val["ID"].as_str().unwrap_or("").to_string();
                    let name = val["Names"].as_str().unwrap_or(&config_name).to_string();
                    let status = val["Status"].as_str().unwrap_or("").to_string();
                    let created = val["CreatedAt"].as_str().unwrap_or("").to_string();
                    if status.to_lowercase().contains("up") {
                        is_running = true;
                    }

                    instances.push(EngineRealtimeInstance {
                        id,
                        name,
                        status,
                        image: image_name.clone(),
                        created_at: created,
                        ports: ports.clone(),
                        cpu_percent: None,
                        memory_usage_bytes: None,
                        memory_limit_bytes: None,
                    });
                }
            }
        }

        // If no container was found but configuration exists, report configured status
        if instances.is_empty() && config_file.is_some() {
            instances.push(EngineRealtimeInstance {
                id: "configured".into(),
                name: config_name.clone(),
                status: "Configured (Not running)".into(),
                image: image_name.clone(),
                created_at: "".into(),
                ports,
                cpu_percent: None,
                memory_usage_bytes: None,
                memory_limit_bytes: None,
            });
        }

        let summary = if config_file.is_some() {
            if is_running {
                format!("Devcontainer [{config_name}] is running")
            } else {
                format!("Devcontainer [{config_name}] configured (stopped)")
            }
        } else {
            "No .devcontainer/devcontainer.json found in active workspace".into()
        };

        Ok(Some(EngineRealtimeStatus {
            engine_id: self.id().to_string(),
            engine_name: self.name().to_string(),
            kind: self.kind(),
            available: diag.available,
            is_running,
            version: diag.version,
            endpoint_or_context: config_file.map(|p| p.to_string_lossy().to_string()).unwrap_or_else(|| "none".into()),
            instances,
            summary,
            updated_at: worklens_core::now(),
        }))
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
            "read-configuration" => {
                let out = command::run(root, "devcontainer", &["read-configuration", "--workspace-folder", &repo.path]).await;
                match out {
                    Ok(bytes) => {
                        let val: serde_json::Value = serde_json::from_slice(&bytes)?;
                        Ok(val)
                    }
                    Err(_) => {
                        if let Some(cfg) = Self::find_config_file(root) {
                            let text = tokio::fs::read_to_string(cfg).await?;
                            let val: serde_json::Value = serde_json::from_str(&text)?;
                            Ok(val)
                        } else {
                            Err(crate::error("No devcontainer configuration found"))
                        }
                    }
                }
            }
            "up" => {
                let out = command::run(root, "devcontainer", &["up", "--workspace-folder", &repo.path]).await?;
                Ok(serde_json::json!({ "output": String::from_utf8_lossy(&out).trim() }))
            }
            "build" => {
                let out = command::run(root, "devcontainer", &["build", "--workspace-folder", &repo.path]).await?;
                Ok(serde_json::json!({ "output": String::from_utf8_lossy(&out).trim() }))
            }
            "stop" => {
                // Find and stop container with devcontainer label
                let out = command::run(
                    root,
                    "docker",
                    &[
                        "ps",
                        "-q",
                        "--filter",
                        &format!("label=devcontainer.local_folder={}", repo.path),
                    ],
                )
                .await;
                if let Ok(bytes) = out {
                    let cid = String::from_utf8_lossy(&bytes).trim().to_string();
                    if !cid.is_empty() {
                        let stop_out = command::run(root, "docker", &["stop", &cid]).await?;
                        return Ok(serde_json::json!({ "stopped": cid, "output": String::from_utf8_lossy(&stop_out).trim() }));
                    }
                }
                Ok(serde_json::json!({ "message": "No running devcontainer found for this workspace" }))
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported devcontainer action: {action}") })),
        }
    }
}
