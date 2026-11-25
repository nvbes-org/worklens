use crate::permissions::PermissionType;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum EngineKind {
    PackageManager,
    BuildSystem,
    #[serde(rename = "iac")]
    IaC,
    Vcs,
    CloudCli,
    Container,
    Kubernetes,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct PluginEngineDecl {
    pub id: String,
    pub name: String,
    pub kind: EngineKind,
    #[serde(default)]
    pub binaries: Vec<String>,
    #[serde(default)]
    pub manifest_patterns: Vec<String>,
    #[serde(default)]
    pub supported_actions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub homepage: Option<String>,
    #[serde(default)]
    pub engines: Vec<PluginEngineDecl>,
    #[serde(default)]
    pub permissions: Vec<PermissionType>,
    pub entrypoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum PluginStatus {
    Installed,
    Enabled,
    Disabled,
    Quarantined,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct PluginMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub homepage: Option<String>,
    pub path: String,
    pub status: PluginStatus,
    pub engines_count: usize,
    pub permissions_count: usize,
    pub installed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct EngineInfo {
    pub id: String,
    pub name: String,
    pub kind: EngineKind,
    pub plugin_id: Option<String>,
    pub binaries: Vec<String>,
    pub available: bool,
    pub version: String,
    pub manifest_patterns: Vec<String>,
    pub supported_actions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct EngineActionRequest {
    pub engine_id: String,
    pub action: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct EngineActionResponse {
    pub success: bool,
    pub data: serde_json::Value,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct EngineRealtimeInstance {
    pub id: String,
    pub name: String,
    pub status: String,
    pub image: String,
    pub created_at: String,
    #[serde(default)]
    pub ports: Vec<String>,
    pub cpu_percent: Option<f64>,
    pub memory_usage_bytes: Option<u64>,
    pub memory_limit_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct EngineRealtimeStatus {
    pub engine_id: String,
    pub engine_name: String,
    pub kind: EngineKind,
    pub available: bool,
    pub is_running: bool,
    pub version: String,
    pub endpoint_or_context: String,
    #[serde(default)]
    pub instances: Vec<EngineRealtimeInstance>,
    pub summary: String,
    pub updated_at: String,
}

