use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum WorkContextSection {
    Summary,
    Links,
    Decisions,
    Expectations,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkContextSelection {
    #[serde(default)]
    pub sections: Vec<WorkContextSection>,
    #[serde(default)]
    pub project_ids: Vec<String>,
    #[serde(default)]
    pub agent_ids: Vec<String>,
    #[serde(default)]
    pub worktree_paths: Vec<String>,
    #[serde(default)]
    pub document_paths: Vec<String>,
}

#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkContextRequest {
    pub id: String,
    pub expected_revision: u32,
    pub selection: WorkContextSelection,
    pub limit: Option<u32>,
    pub max_bytes: Option<u32>,
}

#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkContextPageRequest {
    pub snapshot_id: String,
    pub offset: u32,
    pub limit: Option<u32>,
    pub max_bytes: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkContextItem {
    pub kind: String,
    pub key: String,
    pub data: serde_json::Value,
    pub sources: Vec<crate::Provenance>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkContextPage {
    pub snapshot_id: String,
    pub repository_id: String,
    pub repository_path: String,
    pub work_id: String,
    pub work_revision: u32,
    pub collected_at: String,
    pub expires_at: String,
    pub offset: u32,
    pub next_offset: Option<u32>,
    pub total: u32,
    pub items: Vec<WorkContextItem>,
    pub warning: String,
    pub markdown: String,
}
