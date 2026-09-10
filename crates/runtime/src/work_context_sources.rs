use crate::{Result, error, service::Service};
use serde_json::{Value, json};
use std::{path::Path, time::Duration};
use worklens_core::*;

fn append(
    items: &mut Vec<WorkContextItem>,
    kind: &str,
    key: &str,
    result: Result<(Value, Vec<Provenance>)>,
) -> Result<()> {
    let (data, sources) = match result {
        Ok(value) => value,
        Err(e) => (
            Value::Null,
            vec![Provenance::unavailable(kind, &e.to_string())],
        ),
    };
    items.push(WorkContextItem {
        kind: kind.into(),
        key: key.into(),
        data,
        sources,
    });
    // Enforce the bound during collection too, not just after reading all documents.
    if serde_json::to_vec(items)?.len() > crate::context_snapshot::MAX_SNAPSHOT_BYTES {
        return Err(error("Context snapshot exceeds 2 MB; reduce the selection"));
    }
    Ok(())
}

pub async fn collect(
    service: &Service,
    repo: &Repository,
    selection: &WorkContextSelection,
    items: &mut Vec<WorkContextItem>,
) -> Result<()> {
    // Export never executes Nx/plugins: only an already-collected catalog can be included.
    if !selection.project_ids.is_empty() {
        let graph = service
            .db()?
            .cache(&format!("graph:{}", repo.path))?
            .map(serde_json::from_value::<Graph>)
            .transpose()?;
        for id in &selection.project_ids {
            let result = graph
                .as_ref()
                .and_then(|g| g.nodes.iter().find(|n| &n.id == id).map(|n| (g, n)))
                .ok_or_else(|| {
                    error(
                        "Project absent from cached catalog; collect the catalog explicitly first",
                    )
                })
                .and_then(|(graph, node)| {
                    let sources = graph
                        .sources
                        .iter()
                        .cloned()
                        .map(|mut source| {
                            if source.status == Availability::Available {
                                source.status = Availability::Stale;
                            }
                            source
                        })
                        .collect();
                    Ok((serde_json::to_value(node)?, sources))
                });
            append(items, "project", id, result)?;
        }
    }
    for id in &selection.agent_ids {
        let result = service
            .db()?
            .agent(id)?
            .filter(|a| a.repository_id == repo.id)
            .ok_or_else(|| error("Linked agent is unavailable in this repository"))
            .and_then(|mut agent| {
                agent.presence = presence(&agent.last_seen, chrono::Utc::now());
                let source = Provenance {
                    source: "explicit agent declaration".into(),
                    collected_at: agent.last_seen.clone(),
                    status: Availability::Available,
                    detail: Some("Task state and presence are independent declarations".into()),
                    revision: None,
                };
                Ok((serde_json::to_value(agent)?, vec![source]))
            });
        append(items, "agent", id, result)?;
    }
    for path in &selection.worktree_paths {
        let result = tokio::time::timeout(Duration::from_secs(10), worktree(repo, path))
            .await
            .unwrap_or_else(|_| Err(error("Worktree collection timed out")));
        append(items, "worktree", path, result)?;
    }
    for path in &selection.document_paths {
        let result = crate::documents::read(Path::new(&repo.path), path).await.map(|text| {
            (json!({"path":path,"text":text}), vec![Provenance::observed("selected repository documentation; working-tree content, not an immutable commit")])
        });
        append(items, "document", path, result)?;
    }
    Ok(())
}

async fn worktree(repo: &Repository, path: &str) -> Result<(Value, Vec<Provenance>)> {
    let root = Path::new(path).canonicalize()?;
    let linked = crate::git::repository(&root, false).await?;
    if linked.id != repo.id || linked.path != path {
        return Err(error(
            "Linked worktree no longer belongs to this repository",
        ));
    }
    let git = crate::git::snapshot(linked, 0).await?;
    if !git.worktrees.iter().any(|w| w.path == path) {
        return Err(error("Worktree is no longer registered"));
    }
    Ok((
        json!({"path":path,"branch":git.branch,"head":git.head,"changes":git.changes}),
        vec![git.provenance],
    ))
}
