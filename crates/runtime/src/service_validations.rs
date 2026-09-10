use crate::{Result, error, service::Service};
use serde_json::Value;
use worklens_core::*;

pub async fn collect(service: &Service, repo: &Repository, p: &Value) -> Result<Value> {
    let slug = if let Some(slug) = p["slug"].as_str() {
        slug.to_owned()
    } else {
        crate::git::snapshot(repo.clone(), 0)
            .await?
            .remotes
            .iter()
            .find(|r| r.name == "origin")
            .and_then(|r| crate::github::slug(&r.url))
            .ok_or_else(|| error("No GitHub origin; specify slug"))?
    };
    if !crate::github::valid_slug(&slug) {
        return Err(error("Invalid GitHub repository"));
    }
    let work = p["workId"]
        .as_str()
        .map(|id| service.db()?.work_item(&repo.id, id))
        .transpose()?;
    let sha = if let Some(sha) = p["sha"].as_str() {
        sha.to_owned()
    } else {
        let number = p["number"]
            .as_u64()
            .filter(|n| *n > 0)
            .ok_or_else(|| error("Select a SHA or positive PR number"))?;
        service
            .github
            .get(&format!("/repos/{slug}/pulls/{number}"))
            .await?["head"]["sha"]
            .as_str()
            .ok_or_else(|| error("PR head unavailable"))?
            .to_owned()
    };
    if sha.len() != 40 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(error("Use a full 40-character commit SHA"));
    }
    let ((mut observations, checks), (statuses, status_source)) = tokio::join!(
        service
            .github
            .validation_source(&slug, &sha, ValidationKind::Check),
        service
            .github
            .validation_source(&slug, &sha, ValidationKind::Status)
    );
    observations.extend(statuses);
    let sources = vec![checks, status_source];
    let expectations = work
        .as_ref()
        .map(|w| {
            w.expectations
                .iter()
                .filter(|e| e.repository == slug)
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let assessments = assess_validations(&expectations, &observations, &sources, &sha);
    let report=ValidationReport {repository:slug,sha,work_revision:work.map(|w|w.revision),summary:validation_summary(&assessments),observations,assessments,sources,warnings:vec!["Local expectations are not GitHub branch protection or merge eligibility. Only explicit success satisfies an expectation.".into(),"Snapshot at the displayed SHA in this repository only. Fork-repository and synthetic merge-commit checks are not implicitly combined. Refresh after new commits or reruns.".into()]};
    Ok(serde_json::to_value(report)?)
}
