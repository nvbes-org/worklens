use crate::{
    Result, error,
    service::{Service, text},
};
use serde_json::{Value, json};
use worklens_core::*;

pub async fn apply(
    service: &Service,
    repo: &Repository,
    operation: &Operation,
    p: &Value,
) -> Result<Value> {
    let _guard = service.agent_lock.lock().await;
    let id = text(p, "id")?;
    let event_id = text(p, "eventId")?;
    let mut session = match operation {
        Operation::AgentStart => {
            let worktree = text(p, "worktree")?;
            let tree = crate::git::repository(std::path::Path::new(worktree), false).await?;
            if tree.id != repo.id {
                return Err(error(
                    "Agent worktree does not belong to selected repository",
                ));
            }
            AgentSession {
                id: id.into(),
                repository_id: repo.id.clone(),
                worktree: tree.path,
                tool: text(p, "tool")?.into(),
                objective: text(p, "objective")?.into(),
                state: AgentState::Active,
                message: String::new(),
                last_seen: now(),
                presence: "recent".into(),
                issue: None,
                pr: None,
            }
        }
        _ => service
            .db()?
            .agent(id)?
            .ok_or_else(|| error("Agent session not found"))?,
    };
    if session.repository_id != repo.id {
        return Err(error("Agent session belongs to another repository"));
    }
    // Exact replays are handled transactionally before state transitions.
    let payload = json!({ "operation": operation, "params": p });
    let payload_text = payload.to_string();
    let existing = service.db()?.event_payload(event_id)?;
    if let Some(existing) = existing {
        if existing != payload_text {
            return Err(error("Event ID reused with different content"));
        }
        return Ok(json!({ "session": service.db()?.agent(id)?, "applied": false }));
    }
    if matches!(operation, Operation::AgentStart) && service.db()?.agent(id)?.is_some() {
        return Err(error("Agent session already exists"));
    }
    if matches!(session.state, AgentState::Completed | AgentState::Failed) {
        return Err(error("Agent session is terminal; start a new session"));
    }
    if matches!(operation, Operation::AgentFinish) {
        session.state = if p["failed"].as_bool().unwrap_or(false) {
            AgentState::Failed
        } else {
            AgentState::Completed
        };
    } else if let Some(state) = p["state"].as_str() {
        session.state = match state {
            "active" => AgentState::Active,
            "waiting" => AgentState::Waiting,
            "blocked" => AgentState::Blocked,
            _ => return Err(error("Use finish for terminal states")),
        };
    }
    if let Some(message) = p["message"].as_str() {
        session.message = message.chars().take(8192).collect();
    }
    if let Some(issue) = p["issue"].as_str() {
        session.issue = Some(issue.chars().take(1024).collect());
    }
    if let Some(pr) = p["pr"].as_str() {
        session.pr = Some(pr.chars().take(1024).collect());
    }
    session.last_seen = now();
    let applied = service.db()?.event(event_id, &payload, &session)?;
    Ok(json!({ "session": session, "applied": applied }))
}
