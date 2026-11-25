use crate::{error, service::Service, Result};
use serde_json::{json, Value};
use worklens_core::{CheckRunPayload, Operation, Repository, WorkflowDispatchPayload};

pub async fn resolve_slug(repo: &Repository, p: &Value) -> Result<String> {
    if let Some(slug) = p["slug"].as_str() {
        return Ok(slug.to_owned());
    }
    let snapshot = crate::git::snapshot(repo.clone(), 0).await?;
    let name = p["remote"].as_str().unwrap_or("origin");
    snapshot
        .remotes
        .iter()
        .find(|r| r.name == name)
        .and_then(|r| crate::github::slug(&r.url))
        .ok_or_else(|| error("No GitHub remote found; specify slug owner/repository"))
}

pub async fn handle(
    service: &Service,
    repo: &Repository,
    operation: &Operation,
    p: &Value,
) -> Result<Value> {
    match operation {
        Operation::ValidateBoundaries => {
            let graph = service.graph(repo, false).await?;
            let (config, violations) =
                crate::boundaries::check_workspace_boundaries(&repo.path, &graph)?;
            Ok(json!({
                "config": config,
                "violations": violations,
            }))
        }
        Operation::GithubPublishChecks => {
            let slug = resolve_slug(repo, p).await?;
            let payload: CheckRunPayload = serde_json::from_value(p.clone())
                .map_err(|e| error(format!("Invalid CheckRunPayload: {e}")))?;
            let result =
                crate::github_checks::publish_check_run(&service.github, &slug, &payload).await?;
            Ok(serde_json::to_value(result)?)
        }
        Operation::GithubDispatchWorkflow => {
            let slug = resolve_slug(repo, p).await?;
            let payload: WorkflowDispatchPayload = serde_json::from_value(p.clone())
                .map_err(|e| error(format!("Invalid WorkflowDispatchPayload: {e}")))?;
            let result =
                crate::github_dispatch::dispatch_workflow(&service.github, &slug, &payload).await?;
            Ok(serde_json::to_value(result)?)
        }
        Operation::GithubPostImpactComment => {
            let slug = resolve_slug(repo, p).await?;
            let number = p["number"]
                .as_u64()
                .filter(|n| *n > 0)
                .ok_or_else(|| error("Select a positive PR number"))?;

            let body = if let Some(b) = p["body"].as_str() {
                b.to_string()
            } else {
                // Auto-generate body from PrImpact & boundaries if body is not supplied
                let impact_val = crate::service_impact::collect(service, repo, p).await?;
                let impact: worklens_core::PrImpact = serde_json::from_value(impact_val)?;
                let graph = service.graph(repo, false).await?;
                let (_, all_violations) =
                    crate::boundaries::check_workspace_boundaries(&repo.path, &graph)?;
                let pr_violations = crate::boundaries::filter_violations_for_pr(
                    &all_violations,
                    &impact.collection.files,
                );
                crate::github_comment::format_impact_markdown(&impact, &pr_violations)
            };

            let result = crate::github_comment::post_or_update_impact_comment(
                &service.github,
                &slug,
                number,
                &body,
            )
            .await?;
            Ok(serde_json::to_value(result)?)
        }
        _ => Err(error("Unsupported GitHub extension operation")),
    }
}
