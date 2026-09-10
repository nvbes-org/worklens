use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub source: String,
    pub collected_at: String,
    pub status: Availability,
    pub detail: Option<String>,
    pub revision: Option<String>,
}

impl Provenance {
    pub fn observed(source: &str) -> Self {
        Self {
            source: source.into(),
            collected_at: crate::now(),
            status: Availability::Available,
            detail: None,
            revision: None,
        }
    }
    pub fn unavailable(source: &str, detail: &str) -> Self {
        Self {
            status: Availability::Unavailable,
            detail: Some(detail.into()),
            ..Self::observed(source)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
pub enum Availability {
    Available,
    Partial,
    Stale,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub path: String,
    pub common_dir: String,
    pub trusted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub previous_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub id: String,
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub locked: bool,
    pub prunable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub head: String,
    pub upstream: Option<String>,
    pub tracking: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Remote {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Commit {
    pub sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub date: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    pub repository: Repository,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub changes: Vec<FileChange>,
    pub branches: Vec<Branch>,
    pub remotes: Vec<Remote>,
    pub worktrees: Vec<Worktree>,
    pub commits: Vec<Commit>,
    pub next_offset: Option<u32>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct DiffResult {
    pub text: String,
    pub truncated: bool,
    pub binary: bool,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Document {
    pub path: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ToolStatus {
    pub tool: String,
    pub available: bool,
    pub version: String,
}
