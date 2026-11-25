use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum ProcessStatus {
    Running,
    Stopped,
    Failed,
    Killed,
    Zombie,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum DebugMode {
    None,
    Node,
    Rust,
    Web,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub id: String,
    pub pid: u32,
    pub ppid: Option<u32>,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub component_id: Option<String>,
    pub status: ProcessStatus,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub memory_percent: f32,
    pub disk_read_bytes_per_sec: u64,
    pub disk_write_bytes_per_sec: u64,
    pub uptime_seconds: u64,
    pub started_at: String,
    pub ports: Vec<u16>,
    pub managed: bool,
    pub debug_mode: DebugMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct MachineResources {
    pub total_memory_bytes: u64,
    pub used_memory_bytes: u64,
    pub available_memory_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub cpu_global_percent: f32,
    pub cpu_cores: Vec<f32>,
    pub cpu_count: usize,
    pub load_average: [f64; 3],
    pub disks: Vec<DiskInfo>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum KillAction {
    Warn,
    GracefulKill,
    ImmediateKill,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct AutoKillPolicy {
    pub enabled: bool,
    pub max_memory_bytes: Option<u64>,
    pub max_cpu_percent: Option<f32>,
    pub cpu_sustained_seconds: Option<u32>,
    pub max_runtime_seconds: Option<u64>,
    pub action: KillAction,
    pub whitelist_pids: Vec<u32>,
    pub whitelist_names: Vec<String>,
    pub protect_externals: bool,
}

impl Default for AutoKillPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            max_memory_bytes: Some(2 * 1024 * 1024 * 1024), // 2 GB
            max_cpu_percent: Some(90.0),
            cpu_sustained_seconds: Some(30),
            max_runtime_seconds: None,
            action: KillAction::Warn, // Option A: Warn by default
            whitelist_pids: Vec::new(),
            whitelist_names: vec!["worklens".into(), "cargo".into()],
            protect_externals: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct AutoKillEvent {
    pub id: String,
    pub process_id: String,
    pub process_name: String,
    pub pid: u32,
    pub timestamp: String,
    pub reason: String,
    pub memory_bytes: u64,
    pub cpu_percent: f32,
    pub action_taken: KillAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredCommand {
    pub id: String,
    pub component_id: String,
    pub component_name: String,
    pub component_path: String,
    pub ecosystem: String,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub suggested_debug_mode: DebugMode,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum LogStream {
    Stdout,
    Stderr,
    System,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum ParsedLinkKind {
    Url,
    FileLocation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ParsedLink {
    pub kind: ParsedLinkKind,
    pub target: String,
    pub label: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProcessJournalEntry {
    pub id: String,
    pub process_id: String,
    pub timestamp: String,
    pub stream: LogStream,
    pub level: LogLevel,
    pub text: String,
    pub parsed_links: Vec<ParsedLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentProfile {
    pub id: String,
    pub name: String,
    pub variables: HashMap<String, String>,
    pub inherits_host: bool,
    pub env_file_path: Option<String>,
}
