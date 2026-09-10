use crate::{
    Result,
    context_snapshot::{Snapshot, bounds},
    error,
    service::Service,
};
use serde_json::{Value, json};
use worklens_core::*;

fn validate(selection: &WorkContextSelection, work: &WorkItem) -> Result<()> {
    for (i, section) in selection.sections.iter().enumerate() {
        if selection.sections[..i].contains(section) {
            return Err(error("Duplicate context section"));
        }
    }
    let groups = [
        &selection.project_ids,
        &selection.agent_ids,
        &selection.worktree_paths,
        &selection.document_paths,
    ];
    let count = groups.iter().map(|g| g.len()).sum::<usize>() + selection.sections.len();
    if count == 0 || count > 100 {
        return Err(error("Select 1–100 context sections or sources explicitly"));
    }
    for group in groups {
        for (i, value) in group.iter().enumerate() {
            if value.trim().is_empty()
                || value.len() > 2048
                || value.contains('\0')
                || group[..i].contains(value)
            {
                return Err(error("Invalid or duplicate context source identifier"));
            }
        }
    }
    for (kind, ids) in [
        (WorkLinkKind::Component, &selection.project_ids),
        (WorkLinkKind::Agent, &selection.agent_ids),
        (WorkLinkKind::Worktree, &selection.worktree_paths),
    ] {
        if ids.iter().any(|id| {
            !work.links.iter().any(|l| {
                l.kind == kind && l.status == WorkLinkStatus::Confirmed && &l.reference == id
            })
        }) {
            return Err(error(
                "Context source must be a confirmed link on this work item",
            ));
        }
    }
    Ok(())
}

pub fn declared(work: &WorkItem) -> Provenance {
    Provenance {
        source: "local work declaration (not authenticated)".into(),
        collected_at: work.updated_at.clone(),
        status: Availability::Available,
        detail: None,
        revision: Some(work.revision.to_string()),
    }
}

pub async fn collect(service: &Service, repo: &Repository, p: &Value) -> Result<Value> {
    let p: WorkContextRequest = serde_json::from_value(p.clone())?;
    let (limit, bytes) = bounds(p.limit, p.max_bytes)?;
    let work = service.db()?.work_item(&repo.id, &p.id)?;
    if work.revision != p.expected_revision {
        return Err(error(
            "Revision conflict: reload the work item before exporting context",
        ));
    }
    validate(&p.selection, &work)?;
    let mut items = Vec::new();
    for section in &p.selection.sections {
        let (kind, values): (&str, Vec<Value>) = match section {
            WorkContextSection::Summary => (
                "summary",
                vec![
                    json!({"title":work.title,"objective":work.objective,"criteria":work.criteria,"state":work.state}),
                ],
            ),
            WorkContextSection::Links => (
                "link",
                work.links
                    .iter()
                    .map(serde_json::to_value)
                    .collect::<std::result::Result<_, _>>()?,
            ),
            WorkContextSection::Decisions => (
                "decision",
                work.decisions
                    .iter()
                    .map(serde_json::to_value)
                    .collect::<std::result::Result<_, _>>()?,
            ),
            WorkContextSection::Expectations => (
                "expectation",
                work.expectations
                    .iter()
                    .map(serde_json::to_value)
                    .collect::<std::result::Result<_, _>>()?,
            ),
        };
        for (i, data) in values.into_iter().enumerate() {
            items.push(WorkContextItem {
                kind: kind.into(),
                key: format!("{kind}:{i}"),
                data,
                sources: vec![declared(&work)],
            });
        }
    }
    crate::work_context_sources::collect(service, repo, &p.selection, &mut items).await?;
    if service.db()?.work_item(&repo.id, &p.id)?.revision != work.revision {
        return Err(error(
            "Work item changed while collecting context; reload and export again",
        ));
    }
    let snapshot = Snapshot::new(repo, &work, items)?;
    let page = snapshot.page(0, limit, bytes)?;
    service
        .contexts
        .lock()
        .map_err(|_| error("Context storage unavailable"))?
        .insert(snapshot);
    Ok(serde_json::to_value(page)?)
}
