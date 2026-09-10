use crate::{Result, error};
use worklens_core::{Decision, DecisionResolution, WorkChange, WorkItem, WorkMutation};

fn text(value: &str, max: usize) -> Result<()> {
    if value.trim().is_empty() || value.len() > max || value.contains('\0') {
        return Err(error("Decision field is empty or exceeds its size limit"));
    }
    Ok(())
}

/// Called inside the work-item transaction, after the revision check.
pub fn apply(item: &mut WorkItem, mutation: &WorkMutation, now: &str) -> Result<()> {
    match &mutation.change {
        WorkChange::DecisionRequest { decision } => {
            text(&decision.id, 128)?;
            text(&decision.question, 1000)?;
            text(&decision.context, 8192)?;
            if item.decisions.len() >= 100
                || item.decisions.iter().any(|d| d.request.id == decision.id)
            {
                return Err(error(
                    "Decision ID already exists or 100-decision limit reached",
                ));
            }
            if !(2..=12).contains(&decision.options.len()) {
                return Err(error("A decision requires 2 to 12 distinct options"));
            }
            for (i, option) in decision.options.iter().enumerate() {
                text(option, 200)?;
                if option != option.trim() || decision.options[..i].contains(option) {
                    return Err(error("Decision options must be distinct and trimmed"));
                }
            }
            item.decisions.push(Decision {
                request: decision.clone(),
                work_revision: item.revision,
                requested_by: mutation.actor.clone(),
                requested_at: now.into(),
                resolution: DecisionResolution::Pending,
            });
        }
        WorkChange::DecisionAnswer { id, reason, .. }
        | WorkChange::DecisionCancel { id, reason } => {
            text(id, 128)?;
            text(reason, 8192)?;
            let decision = item
                .decisions
                .iter_mut()
                .find(|d| &d.request.id == id)
                .ok_or_else(|| error("Decision not found in this work item"))?;
            if !matches!(decision.resolution, DecisionResolution::Pending) {
                return Err(error(
                    "Decision is already resolved; request a new decision instead",
                ));
            }
            decision.resolution =
                if let WorkChange::DecisionAnswer { answer, .. } = &mutation.change {
                    if !decision.request.options.contains(answer) {
                        return Err(error(
                            "Answer must exactly match one of the requested options",
                        ));
                    }
                    DecisionResolution::Answered {
                        answer: answer.clone(),
                        reason: reason.clone(),
                        actor: mutation.actor.clone(),
                        at: now.into(),
                    }
                } else {
                    DecisionResolution::Cancelled {
                        reason: reason.clone(),
                        actor: mutation.actor.clone(),
                        at: now.into(),
                    }
                };
        }
        _ => return Err(error("Invalid decision action")),
    }
    Ok(())
}
