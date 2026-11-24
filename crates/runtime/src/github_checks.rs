use crate::{Result, error, github::Github};
use serde_json::json;
use worklens_core::{CheckAnnotation, CheckRunPayload, CheckRunResult};

pub async fn publish_check_run(
    github: &Github,
    repo_slug: &str,
    payload: &CheckRunPayload,
) -> Result<CheckRunResult> {
    let endpoint = format!("/repos/{repo_slug}/check-runs");

    // GitHub limits annotations to 50 per API call
    let first_chunk: Vec<&CheckAnnotation> = payload.annotations.iter().take(50).collect();

    let initial_body = json!({
        "name": payload.name,
        "head_sha": payload.head_sha,
        "status": payload.status,
        "conclusion": payload.conclusion,
        "output": {
            "title": payload.title,
            "summary": payload.summary,
            "text": payload.text,
            "annotations": first_chunk,
        }
    });

    let res = github.post(&endpoint, &initial_body).await?;
    let check_run_id = res["id"]
        .as_u64()
        .ok_or_else(|| error("GitHub check run ID missing from response"))?;
    let html_url = res["html_url"].as_str().unwrap_or_default().to_string();

    // If there are more than 50 annotations, send subsequent chunks via PATCH
    if payload.annotations.len() > 50 {
        let patch_endpoint = format!("/repos/{repo_slug}/check-runs/{check_run_id}");
        for chunk in payload.annotations[50..].chunks(50) {
            let patch_body = json!({
                "output": {
                    "title": payload.title,
                    "summary": payload.summary,
                    "annotations": chunk,
                }
            });
            let _ = github.patch(&patch_endpoint, &patch_body).await?;
        }
    }

    Ok(CheckRunResult {
        check_run_id,
        html_url,
        name: payload.name.clone(),
        status: payload.status.clone(),
        conclusion: payload.conclusion.clone(),
    })
}
