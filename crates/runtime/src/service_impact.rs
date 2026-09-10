use crate::{Result, error, service::Service};
use serde_json::Value;
use std::time::Duration;
use tokio::time::timeout;
use worklens_core::*;

pub async fn collect(service: &Service, repo: &Repository, p: &Value) -> Result<Value> {
    let number = p["number"]
        .as_u64()
        .filter(|n| *n > 0)
        .ok_or_else(|| error("Select a positive PR number"))?;
    let before = timeout(
        Duration::from_secs(5),
        crate::git::snapshot(repo.clone(), 0),
    )
    .await
    .map_err(|_| error("Local Git snapshot timed out"))??;
    let slug = p["slug"]
        .as_str()
        .map(str::to_owned)
        .or_else(|| {
            before
                .remotes
                .iter()
                .find(|r| r.name == p["remote"].as_str().unwrap_or("origin"))
                .and_then(|r| crate::github::slug(&r.url))
        })
        .ok_or_else(|| error("No GitHub remote; specify slug owner/repository"))?;
    let collection = service.github.collect_pr_files(&slug, number).await?;
    let graph = match timeout(Duration::from_secs(25), crate::catalog::collect(repo)).await {
        Ok(Ok(graph)) => graph,
        result => Graph {
            nodes: Vec::new(),
            edges: Vec::new(),
            sources: vec![Provenance::unavailable(
                "local graph",
                &match result {
                    Ok(Err(e)) => e.to_string(),
                    _ => "Graph collection deadline reached".into(),
                },
            )],
        },
    };
    let after = timeout(
        Duration::from_secs(5),
        crate::git::snapshot(repo.clone(), 0),
    )
    .await;
    let mut warnings = vec!["Impact is dependency reachability, not proof that validations are sufficient. Graph comes from the selected working tree, not an immutable PR checkout.".into()];
    let graph_stable = matches!(&after, Ok(Ok(s)) if s.head==before.head && s.changes.is_empty() && before.changes.is_empty());
    let source_matches = collection
        .revision
        .head_repository
        .as_deref()
        .is_some_and(|head| {
            before
                .remotes
                .iter()
                .any(|r| crate::github::slug(&r.url).as_deref() == Some(head))
        });
    let graph_matches_head = graph_stable
        && source_matches
        && before.head.as_deref() == Some(&collection.revision.head_sha);
    if !graph_matches_head {
        warnings.push("Local graph differs from the PR head, is dirty, belongs to another source, or could not be verified. Impact is approximate.".into());
    }
    if graph
        .sources
        .iter()
        .any(|s| s.status != Availability::Available)
    {
        warnings.push(
            "Some graph connectors are unavailable or partial; dependencies may be missing.".into(),
        );
    }
    if !collection.revision_verified {
        warnings.push("Impact withheld because PR revision consistency was not verified.".into());
    }
    let impact = detailed_impact(
        &graph,
        if collection.revision_verified {
            &collection.files
        } else {
            &[]
        },
    );
    let result = PrImpact {
        collection,
        graph_sources: graph.sources,
        graph_worktree: repo.path.clone(),
        graph_head: before.head,
        graph_matches_head,
        impact,
        warnings,
    };
    let value = serde_json::to_value(result)?;
    if value.to_string().len() > 12_000_000 {
        return Err(error(
            "Impact result exceeds transport size limit; no complete result returned",
        ));
    }
    Ok(value)
}
