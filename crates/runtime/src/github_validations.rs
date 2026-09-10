use crate::{Result, error, github::Github};
use serde_json::Value;
use std::collections::BTreeSet;
use std::time::Duration;
use tokio::time::{Instant, timeout_at};
use worklens_core::*;

fn observation(v: &Value, kind: &ValidationKind, sha: &str) -> Result<ValidationObservation> {
    let check = *kind == ValidationKind::Check;
    if check && v["head_sha"].as_str() != Some(sha) {
        return Err(error("Check SHA does not match requested commit"));
    }
    let name = v[if check { "name" } else { "context" }]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 500)
        .ok_or_else(|| error("Missing control name"))?;
    let id = v["id"]
        .as_u64()
        .ok_or_else(|| error("Missing control ID"))?;
    let state = v[if check { "status" } else { "state" }]
        .as_str()
        .unwrap_or("unknown");
    let conclusion = v["conclusion"].as_str().unwrap_or("unknown");
    let raw = if check && state == "completed" {
        conclusion
    } else {
        state
    };
    if raw.len() > 100 {
        return Err(error("Invalid validation state length"));
    }
    let outcome = match raw {
        "success" => ValidationOutcome::Success,
        "failure" | "error" => ValidationOutcome::Failure,
        "pending" | "queued" | "in_progress" | "waiting" | "requested" => {
            ValidationOutcome::Pending
        }
        "cancelled" => ValidationOutcome::Cancelled,
        "skipped" => ValidationOutcome::Skipped,
        "neutral" => ValidationOutcome::Neutral,
        "timed_out" => ValidationOutcome::TimedOut,
        "action_required" => ValidationOutcome::ActionRequired,
        _ => ValidationOutcome::Unknown,
    };
    // An invalid check status must not masquerade as a successful conclusion.
    let outcome = if check && state != "completed" && outcome == ValidationOutcome::Success {
        ValidationOutcome::Unknown
    } else {
        outcome
    };
    Ok(ValidationObservation {
        id: format!("{}:{id}", if check { "check" } else { "status" }),
        kind: kind.clone(),
        name: name.into(),
        app_id: if check {
            v["app"]["id"]
                .as_u64()
                .filter(|id| *id <= 9_007_199_254_740_991)
        } else {
            None
        },
        sha: sha.into(),
        outcome,
        raw_state: raw.into(),
        url: v[if check { "html_url" } else { "target_url" }]
            .as_str()
            .filter(|s| s.len() <= 2048 && s.starts_with("https://github.com/"))
            .map(str::to_owned),
    })
}

impl Github {
    pub async fn validation_source(
        &self,
        repo: &str,
        sha: &str,
        kind: ValidationKind,
    ) -> (Vec<ValidationObservation>, Provenance) {
        let check = kind == ValidationKind::Check;
        let mut source = Provenance::observed(if check {
            "GitHub checks"
        } else {
            "GitHub statuses"
        });
        source.revision = Some(sha.into());
        let endpoint = if check { "check-runs" } else { "status" };
        let key = if check { "check_runs" } else { "statuses" };
        let mut observations = Vec::new();
        let mut seen = BTreeSet::new();
        let deadline = Instant::now() + Duration::from_secs(45);
        let mut expected = None;
        let collected: Result<()> = async {
            for page in 1..=10 {
                let filter = if check { "&filter=latest" } else { "" };
                let value = timeout_at(
                    deadline,
                    self.get(&format!(
                        "/repos/{repo}/commits/{sha}/{endpoint}?per_page=100&page={page}{filter}"
                    )),
                )
                .await
                .map_err(|_| error("Validation collection deadline reached"))??;
                if !check && value["sha"].as_str() != Some(sha) {
                    return Err(error("Status SHA mismatch"));
                }
                let count = value["total_count"]
                    .as_u64()
                    .ok_or_else(|| error("Validation count unavailable"))?;
                if expected.is_some_and(|previous| previous != count) {
                    return Err(error("Validation count changed during pagination; refresh"));
                }
                expected = Some(count);
                let rows = value[key]
                    .as_array()
                    .ok_or_else(|| error("Invalid validation page"))?;
                if rows.len() > 100 {
                    return Err(error("Oversized validation page"));
                }
                for row in rows {
                    let item = observation(row, &kind, sha)?;
                    if !seen.insert(item.id.clone()) {
                        return Err(error("Duplicate validation across pages; refresh"));
                    }
                    observations.push(item);
                }
                if observations.len() as u64 == count {
                    return Ok(());
                }
                if rows.len() < 100 {
                    return Err(error("Incomplete validation listing"));
                }
            }
            Err(error(
                "Validation listing limited to 1000 controls per source",
            ))
        }
        .await;
        if let Err(e) = collected {
            source.status = if observations.is_empty() {
                Availability::Unavailable
            } else {
                Availability::Partial
            };
            source.detail = Some(e.to_string());
        }
        source.collected_at = now();
        (observations, source)
    }
}
