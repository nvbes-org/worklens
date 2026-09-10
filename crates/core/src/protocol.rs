use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    Open,
    Recent,
    Trust,
    Status,
    Git,
    Diff,
    Projects,
    Graph,
    Tasks,
    Impact,
    Documents,
    Document,
    Context,
    Doctor,
    Agents,
    AgentStart,
    AgentUpdate,
    AgentHeartbeat,
    AgentFinish,
    GithubAuthStart,
    GithubAuthPoll,
    GithubAuthStatus,
    GithubLogout,
    Issues,
    Prs,
    Pr,
    Issue,
    Ci,
    Run,
    Logs,
    Search,
    WorkList,
    WorkShow,
    WorkCreate,
    WorkUpdate,
    WorkLink,
    WorkUnlink,
    WorkNote,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Request {
    pub version: u32,
    pub operation: Operation,
    pub repository: Option<String>,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Response {
    pub version: u32,
    pub data: serde_json::Value,
    pub error: Option<String>,
}

impl Response {
    pub fn success(data: serde_json::Value) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            data,
            error: None,
        }
    }
    pub fn failure(error: impl ToString) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            data: serde_json::Value::Null,
            error: Some(error.to_string()),
        }
    }
}
