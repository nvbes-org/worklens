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

pub struct KubernetesEngine;

#[async_trait]
impl ToolingEngine for KubernetesEngine {
    fn id(&self) -> &str {
        "kubernetes"
    }

    fn name(&self) -> &str {
        "Kubernetes Cluster Orchestrator"
    }

    fn kind(&self) -> EngineKind {
        EngineKind::Kubernetes
    }

    fn binaries(&self) -> Vec<String> {
        vec!["kubectl".into(), "minikube".into(), "kind".into(), "k3s".into()]
    }

    fn manifest_patterns(&self) -> Vec<String> {
        vec![
            "k8s".into(),
            "kubernetes".into(),
            "Chart.yaml".into(),
            "kustomization.yaml".into(),
            "helm".into(),
        ]
    }

    fn supported_actions(&self) -> Vec<String> {
        vec![
            "pods".into(),
            "deployments".into(),
            "services".into(),
            "events".into(),
            "logs".into(),
            "contexts".into(),
            "switch-context".into(),
        ]
    }

    async fn detect(&self, root: &Path) -> Result<bool> {
        for pattern in self.manifest_patterns() {
            if root.join(&pattern).exists() {
                return Ok(true);
            }
        }
        if let Some(home) = directories::BaseDirs::new() {
            if home.home_dir().join(".kube/config").exists() {
                return Ok(true);
            }
        }
        let out = command::run(&PathBuf::from("/"), "kubectl", &["version", "--client"]).await;
        Ok(out.is_ok())
    }

    async fn diagnose(&self) -> ToolStatus {
        let output = command::run(&PathBuf::from("/"), "kubectl", &["version", "--client=true", "--output=json"]).await;
        if let Ok(bytes) = output {
            let version = if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                val["clientVersion"]["gitVersion"].as_str().unwrap_or("Client available").to_string()
            } else {
                String::from_utf8_lossy(&bytes).trim().to_string()
            };
            ToolStatus {
                tool: "kubectl".into(),
                available: true,
                version,
            }
        } else {
            ToolStatus {
                tool: "kubectl".into(),
                available: false,
                version: "kubectl CLI not found".into(),
            }
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
                endpoint_or_context: "k8s://none".into(),
                instances: Vec::new(),
                summary: "kubectl CLI not found".into(),
                updated_at: worklens_core::now(),
            }));
        }

        // Check active context
        let ctx_out = command::run(&root, "kubectl", &["config", "current-context"]).await;
        let context_name = ctx_out
            .map(|v| String::from_utf8_lossy(&v).trim().to_string())
            .unwrap_or_else(|_| "Unknown context".into());

        // Check cluster connectivity
        let pods_out = command::run(
            &root,
            "kubectl",
            &["get", "pods", "-A", "-o", "json", "--request-timeout=3s"],
        )
        .await;

        let mut instances = Vec::new();
        let is_running = pods_out.is_ok();

        if let Ok(bytes) = pods_out {
            if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                if let Some(items) = val["items"].as_array() {
                    for item in items {
                        let metadata = &item["metadata"];
                        let status = &item["status"];
                        let spec = &item["spec"];

                        let name = metadata["name"].as_str().unwrap_or("").to_string();
                        let ns = metadata["namespace"].as_str().unwrap_or("default");
                        let phase = status["phase"].as_str().unwrap_or("Unknown").to_string();
                        let created = metadata["creationTimestamp"].as_str().unwrap_or("").to_string();

                        let mut image = "unknown".to_string();
                        if let Some(containers) = spec["containers"].as_array() {
                            if let Some(first) = containers.first() {
                                image = first["image"].as_str().unwrap_or("").to_string();
                            }
                        }

                        instances.push(EngineRealtimeInstance {
                            id: format!("{ns}/{name}"),
                            name: format!("{ns}/{name}"),
                            status: phase,
                            image,
                            created_at: created,
                            ports: Vec::new(),
                            cpu_percent: None,
                            memory_usage_bytes: None,
                            memory_limit_bytes: None,
                        });
                    }
                }
            }
        }

        let running_count = instances.iter().filter(|i| i.status.eq_ignore_ascii_case("running")).count();
        let summary = if is_running {
            format!("{}/{} pods running in context [{}]", running_count, instances.len(), context_name)
        } else {
            format!("Context [{}] unreachable or cluster down", context_name)
        };

        Ok(Some(EngineRealtimeStatus {
            engine_id: self.id().to_string(),
            engine_name: self.name().to_string(),
            kind: self.kind(),
            available: true,
            is_running,
            version: diag.version,
            endpoint_or_context: context_name,
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
        let pod_id = params["podId"].as_str().unwrap_or("");
        let ns = params["namespace"].as_str().unwrap_or("default");

        match action {
            "pods" => {
                let out = command::run(root, "kubectl", &["get", "pods", "-A", "-o", "json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "deployments" => {
                let out = command::run(root, "kubectl", &["get", "deployments", "-A", "-o", "json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "services" => {
                let out = command::run(root, "kubectl", &["get", "services", "-A", "-o", "json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "events" => {
                let out = command::run(root, "kubectl", &["get", "events", "-A", "-o", "json"]).await?;
                let val: serde_json::Value = serde_json::from_slice(&out)?;
                Ok(val)
            }
            "logs" => {
                if pod_id.is_empty() {
                    return Err(crate::error("Missing podId param"));
                }
                let mut actual_pod = pod_id;
                let mut actual_ns = ns;
                if let Some((n, p)) = pod_id.split_once('/') {
                    actual_ns = n;
                    actual_pod = p;
                }
                let out = command::run(root, "kubectl", &["logs", "--tail", "100", "-n", actual_ns, actual_pod]).await?;
                Ok(serde_json::json!({ "podId": pod_id, "logs": String::from_utf8_lossy(&out) }))
            }
            "contexts" => {
                let out = command::run(root, "kubectl", &["config", "get-contexts", "-o", "name"]).await?;
                let lines: Vec<String> = String::from_utf8_lossy(&out)
                    .lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect();
                Ok(serde_json::to_value(lines)?)
            }
            "switch-context" => {
                let target = params["context"].as_str().unwrap_or("");
                if target.is_empty() {
                    return Err(crate::error("Missing context parameter"));
                }
                let out = command::run(root, "kubectl", &["config", "use-context", target]).await?;
                Ok(serde_json::json!({ "context": target, "output": String::from_utf8_lossy(&out).trim() }))
            }
            _ => Ok(serde_json::json!({ "error": format!("Unsupported Kubernetes action: {action}") })),
        }
    }
}
