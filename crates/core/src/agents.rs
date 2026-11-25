use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    Active,
    Waiting,
    Blocked,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AgentSession {
    pub id: String,
    pub repository_id: String,
    pub worktree: String,
    pub tool: String,
    pub objective: String,
    pub state: AgentState,
    pub message: String,
    pub last_seen: String,
    pub presence: String,
    pub issue: Option<String>,
    pub pr: Option<String>,
}

pub fn presence(last_seen: &str, now: chrono::DateTime<chrono::Utc>) -> String {
    chrono::DateTime::parse_from_rfc3339(last_seen)
        .ok()
        .filter(|date| now.signed_duration_since(*date).num_seconds() < 120)
        .map(|_| "recent".into())
        .unwrap_or_else(|| "unknown".into())
}
