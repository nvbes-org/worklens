use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum CloudProvider {
    Aws,
    Gcp,
    Scaleway,
    Azure,
    Other(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum CloudResourceCategory {
    Compute,
    Storage,
    Database,
    Network,
    Security,
    ContainersK8s,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CloudResource {
    pub id: String,
    pub name: String,
    pub resource_type: String,
    pub provider: CloudProvider,
    pub category: CloudResourceCategory,
    pub source_file: String,
    pub line_number: Option<u32>,
    pub region: Option<String>,
    pub environment: Option<String>,
    #[serde(default)]
    pub attributes: HashMap<String, String>,
    #[serde(default)]
    pub tags: HashMap<String, String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CloudModule {
    pub name: String,
    pub source: String,
    pub version: Option<String>,
    pub source_file: String,
    pub line_number: Option<u32>,
    #[serde(default)]
    pub providers: Vec<CloudProvider>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CloudVariable {
    pub name: String,
    pub var_type: Option<String>,
    pub default_value: Option<String>,
    pub description: Option<String>,
    pub sensitive: bool,
    pub source_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CloudOutput {
    pub name: String,
    pub description: Option<String>,
    pub sensitive: bool,
    pub source_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CloudBackend {
    pub backend_type: String,
    pub bucket_or_path: Option<String>,
    pub region: Option<String>,
    pub source_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CloudDeploymentPipeline {
    pub id: String,
    pub name: String,
    pub file_path: String,
    #[serde(default)]
    pub providers: Vec<CloudProvider>,
    #[serde(default)]
    pub triggers: Vec<String>,
    #[serde(default)]
    pub environments: Vec<String>,
    #[serde(default)]
    pub detected_actions: Vec<String>,
    #[serde(default)]
    pub deploy_jobs: Vec<String>,
    #[serde(default)]
    pub secrets_used: Vec<String>,
    pub is_iac: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CloudArchitectureNode {
    pub id: String,
    pub name: String,
    pub node_type: String, // "resource" | "module" | "pipeline" | "live_server" | "live_database" | "live_k8s"
    pub provider: CloudProvider,
    pub category: CloudResourceCategory,
    pub environment: Option<String>,
    pub status: Option<String>,
    pub is_live: bool,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CloudArchitectureEdge {
    pub source: String,
    pub target: String,
    pub relation: String, // "network" | "storage" | "security" | "database" | "deploys" | "dependency" | "module"
    pub label: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
pub struct CloudArchitectureGraph {
    #[serde(default)]
    pub nodes: Vec<CloudArchitectureNode>,
    #[serde(default)]
    pub edges: Vec<CloudArchitectureEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ScalewayServer {
    pub id: String,
    pub name: String,
    pub status: String,
    pub commercial_type: String,
    pub zone: String,
    pub public_ip: Option<String>,
    pub private_ip: Option<String>,
    pub image_name: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ScalewayDatabase {
    pub id: String,
    pub name: String,
    pub status: String,
    pub engine: String,
    pub node_type: String,
    pub region: String,
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ScalewayK8sCluster {
    pub id: String,
    pub name: String,
    pub status: String,
    pub version: String,
    pub cni: String,
    pub region: String,
    pub node_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ScalewayPrivateNetwork {
    pub id: String,
    pub name: String,
    pub region: String,
    #[serde(default)]
    pub subnets: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
pub struct ScalewayLiveReport {
    pub connected: bool,
    pub auth_source: String, // "keychain" | "env" | "none"
    pub project_id: Option<String>,
    #[serde(default)]
    pub servers: Vec<ScalewayServer>,
    #[serde(default)]
    pub databases: Vec<ScalewayDatabase>,
    #[serde(default)]
    pub k8s_clusters: Vec<ScalewayK8sCluster>,
    #[serde(default)]
    pub private_networks: Vec<ScalewayPrivateNetwork>,
    pub error: Option<String>,
    pub fetched_at: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
pub struct CloudStats {
    pub total_resources: u32,
    #[serde(default)]
    pub by_provider: HashMap<String, u32>,
    #[serde(default)]
    pub by_category: HashMap<String, u32>,
    #[serde(default)]
    pub by_environment: HashMap<String, u32>,
    pub iac_files_count: u32,
    pub modules_count: u32,
    pub pipelines_count: u32,
    pub live_scaleway_resources: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
pub struct CloudScanResult {
    pub scanned_at: String,
    pub stats: CloudStats,
    #[serde(default)]
    pub resources: Vec<CloudResource>,
    #[serde(default)]
    pub modules: Vec<CloudModule>,
    #[serde(default)]
    pub variables: Vec<CloudVariable>,
    #[serde(default)]
    pub outputs: Vec<CloudOutput>,
    #[serde(default)]
    pub backends: Vec<CloudBackend>,
    #[serde(default)]
    pub pipelines: Vec<CloudDeploymentPipeline>,
    #[serde(default)]
    pub architecture: CloudArchitectureGraph,
    pub scaleway_live: Option<ScalewayLiveReport>,
    #[serde(default)]
    pub warnings: Vec<String>,
}
