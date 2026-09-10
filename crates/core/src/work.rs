use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
pub enum WorkState {
    Todo,
    InProgress,
    Waiting,
    Blocked,
    Completed,
    Abandoned,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
pub enum WorkLinkKind {
    Pr,
    Issue,
    Worktree,
    Agent,
    Component,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
pub enum WorkLinkStatus {
    Candidate,
    Confirmed,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkLink {
    pub kind: WorkLinkKind,
    pub reference: String,
    pub status: WorkLinkStatus,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkItem {
    pub id: String,
    pub repository_id: String,
    pub title: String,
    pub objective: String,
    pub criteria: String,
    pub state: WorkState,
    pub revision: u32,
    pub links: Vec<WorkLink>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkEvent {
    pub event_id: String,
    pub revision: u32,
    pub action: String,
    /// Attribution is explicitly supplied by the caller, not an authenticated identity.
    pub actor: String,
    pub created_at: String,
    pub details: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkDetail {
    pub item: WorkItem,
    pub events: Vec<WorkEvent>,
    pub next_offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkList {
    pub items: Vec<WorkItem>,
    pub next_offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct WorkResult {
    pub applied: bool,
    pub item: WorkItem,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum WorkChange {
    Create {
        title: String,
        objective: String,
        criteria: String,
        links: Vec<WorkLink>,
    },
    Update {
        title: String,
        objective: String,
        criteria: String,
        state: WorkState,
    },
    Link {
        link: WorkLink,
    },
    Unlink {
        kind: WorkLinkKind,
        reference: String,
    },
    Note {
        text: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkMutation {
    pub id: String,
    pub event_id: String,
    pub actor: String,
    /// Zero for creation; otherwise the last revision read by the caller.
    pub expected_revision: u32,
    pub change: WorkChange,
}
