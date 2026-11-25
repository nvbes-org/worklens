use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DecisionRequest {
    pub id: String,
    pub question: String,
    /// Explicit scope/evidence supplied by the requester, not executable instructions.
    pub context: String,
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum DecisionResolution {
    Pending,
    Answered {
        answer: String,
        reason: String,
        actor: String,
        at: String,
    },
    Cancelled {
        reason: String,
        actor: String,
        at: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub request: DecisionRequest,
    /// Revision inspected when requesting the decision. Not an authorization for later revisions.
    pub work_revision: u32,
    /// Caller-declared attribution; never an authenticated human identity.
    pub requested_by: String,
    pub requested_at: String,
    pub resolution: DecisionResolution,
}
