use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityRecord {
    pub algorithm: String,
    pub value: String,
    pub source: String,
    pub scope: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ComponentCommit {
    pub sha: String,
    pub date: String,
    pub author: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NxAffected {
    pub affected: Option<bool>,
    pub base: String,
    pub head: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ComponentMetadata {
    pub member_ids: Vec<String>,
    pub collected_at: String,
    pub first_commit_at: Option<String>,
    pub modified_at: Option<String>,
    pub last_commit: Option<ComponentCommit>,
    #[ts(type = "number | null")]
    pub size_bytes: Option<u64>,
    pub file_count: Option<u32>,
    pub size_scope: String,
    pub dirty: Option<bool>,
    pub integrity: Vec<IntegrityRecord>,
    pub nx: NxAffected,
    pub warnings: Vec<String>,
}
