use crate::{
    Result, error,
    service::{Service, text},
};
use serde_json::Value;
use std::path::Path;
use worklens_core::*;

fn bounded(value: &str, max: usize, required: bool) -> Result<()> {
    if value.len() > max || (required && value.trim().is_empty()) || value.contains('\0') {
        return Err(error("Work field is empty or exceeds its size limit"));
    }
    Ok(())
}

async fn validate_link(service: &Service, repo: &Repository, link: &WorkLink) -> Result<()> {
    bounded(&link.reference, 2048, true)?;
    bounded(&link.reason, 2048, true)?;
    match link.kind {
        WorkLinkKind::Pr | WorkLinkKind::Issue => {
            let url =
                reqwest::Url::parse(&link.reference).map_err(|_| error("Invalid GitHub link"))?;
            let parts: Vec<_> = url.path().trim_start_matches('/').split('/').collect();
            let kind = if link.kind == WorkLinkKind::Pr {
                "pull"
            } else {
                "issues"
            };
            if url.scheme() != "https"
                || url.host_str() != Some("github.com")
                || !url.username().is_empty()
                || url.password().is_some()
                || url.port().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
                || parts.len() != 4
                || parts[0].is_empty()
                || parts[1].is_empty()
                || parts[2] != kind
                || parts[3].parse::<u64>().ok().is_none_or(|n| n == 0)
            {
                return Err(error(
                    "Use a canonical https://github.com/owner/repository/pull/number or issues/number URL",
                ));
            }
        }
        WorkLinkKind::Worktree => {
            let path = Path::new(&link.reference).canonicalize()?;
            let linked = crate::git::repository(&path, false).await?;
            if linked.id != repo.id || linked.path != link.reference {
                return Err(error(
                    "Worktree must be a canonical path in the selected repository",
                ));
            }
            if !crate::git::snapshot(repo.clone(), 0)
                .await?
                .worktrees
                .iter()
                .any(|w| w.path == link.reference)
            {
                return Err(error("Worktree is not registered by Git"));
            }
        }
        WorkLinkKind::Agent => {
            let agent = service
                .db()?
                .agent(&link.reference)?
                .ok_or_else(|| error("Agent not found"))?;
            if agent.repository_id != repo.id {
                return Err(error("Agent belongs to another repository"));
            }
        }
        WorkLinkKind::Component => {
            if !service
                .graph(repo, false)
                .await?
                .nodes
                .iter()
                .any(|n| n.id == link.reference)
            {
                return Err(error(
                    "Component is not present in the selected repository graph",
                ));
            }
        }
    }
    Ok(())
}

pub async fn dispatch(
    service: &Service,
    repo: &Repository,
    operation: &Operation,
    p: &Value,
) -> Result<Value> {
    let offset = p["offset"].as_u64().unwrap_or(0).min(100_000) as u32;
    if matches!(operation, Operation::WorkList) {
        let state = p
            .get("state")
            .filter(|v| !v.is_null())
            .map(|v| serde_json::from_value(v.clone()))
            .transpose()?;
        return Ok(serde_json::to_value(service.db()?.work_list(
            &repo.id,
            offset,
            state,
            p["reference"].as_str(),
        )?)?);
    }
    if matches!(operation, Operation::WorkShow) {
        return Ok(serde_json::to_value(service.db()?.work_detail(
            &repo.id,
            text(p, "id")?,
            offset,
        )?)?);
    }
    let mutation: WorkMutation = serde_json::from_value(p.clone())?;
    // Reject unknown variant fields too; ts-rs does not support serde's enum-level deny attribute.
    if serde_json::to_value(&mutation)? != *p {
        return Err(error("Unexpected work mutation fields"));
    }
    bounded(&mutation.id, 128, true)?;
    bounded(&mutation.event_id, 128, true)?;
    bounded(&mutation.actor, 200, true)?;
    let expected = match operation {
        Operation::WorkCreate => "create",
        Operation::WorkUpdate => "update",
        Operation::WorkLink => "link",
        Operation::WorkUnlink => "unlink",
        Operation::WorkNote => "note",
        Operation::WorkExpectations => "expectations",
        _ => return Err(error("Invalid work operation")),
    };
    if p["change"]["action"] != expected {
        return Err(error("Work action does not match operation"));
    }
    if let Some(replay) = service.db()?.work_replay(&repo.id, &mutation)? {
        return Ok(serde_json::to_value(replay)?);
    }
    match &mutation.change {
        WorkChange::Expectations { expectations } => {
            if expectations.len() > 100 {
                return Err(error("At most 100 validation expectations"));
            }
            for (i, e) in expectations.iter().enumerate() {
                bounded(&e.name, 200, true)?;
                if !crate::github::valid_slug(&e.repository)
                    || e.repository.len() > 200
                    || e.app_id == Some(0)
                    || e.app_id.is_some_and(|id| id > 9_007_199_254_740_991)
                    || (e.kind == ValidationKind::Status && e.app_id.is_some())
                    || expectations[..i].contains(e)
                {
                    return Err(error("Invalid or duplicate validation expectation"));
                }
            }
        }
        WorkChange::Create {
            title,
            objective,
            criteria,
            links,
        } => {
            bounded(title, 200, true)?;
            bounded(objective, 8192, true)?;
            bounded(criteria, 16384, false)?;
            if links.len() > 100 {
                return Err(error("Too many links"));
            }
            for (i, link) in links.iter().enumerate() {
                if links[..i]
                    .iter()
                    .any(|l| l.kind == link.kind && l.reference == link.reference)
                {
                    return Err(error("Duplicate link"));
                }
                validate_link(service, repo, link).await?;
            }
        }
        WorkChange::Update {
            title,
            objective,
            criteria,
            ..
        } => {
            bounded(title, 200, true)?;
            bounded(objective, 8192, true)?;
            bounded(criteria, 16384, false)?;
        }
        WorkChange::Link { link } => validate_link(service, repo, link).await?,
        WorkChange::Unlink { reference, .. } => bounded(reference, 2048, true)?,
        WorkChange::Note { text } => bounded(text, 8192, true)?,
    }
    Ok(serde_json::to_value(
        service.db()?.change_work(&repo.id, &mutation)?,
    )?)
}
