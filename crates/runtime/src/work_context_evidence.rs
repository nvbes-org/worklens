use crate::{Result, error, service::Service};
use serde_json::{Value, json};
use worklens_core::*;

pub(crate) fn pr_identity(url: &str) -> Result<(&str, u64)> {
    let (slug, number) = url
        .strip_prefix("https://github.com/")
        .and_then(|path| path.split_once("/pull/"))
        .ok_or_else(|| {
            error("Use a canonical https://github.com/owner/repository/pull/number URL")
        })?;
    let parsed = number
        .parse::<u64>()
        .ok()
        .filter(|n| *n > 0 && n.to_string() == number);
    if !crate::github::valid_slug(slug) || parsed.is_none() {
        return Err(error("Invalid GitHub PR evidence URL"));
    }
    Ok((slug, parsed.ok_or_else(|| error("Invalid PR number"))?))
}

// No workspace tool execution: impact uses only the previously collected catalog.
pub(crate) async fn collect(
    service: &Service,
    repo: &Repository,
    work: &WorkItem,
    url: &str,
) -> Result<Vec<WorkContextItem>> {
    let (slug, number) = pr_identity(url)?;
    let files = service.github.collect_pr_files(slug, number).await?;
    if !files.revision_verified {
        return Err(error(
            "PR revision unverified; evidence withheld. Refresh the dossier.",
        ));
    }
    let sha = &files.revision.head_sha;
    let ((mut observations, checks), (statuses, status_source)) = tokio::join!(
        service
            .github
            .validation_source(slug, sha, ValidationKind::Check),
        service
            .github
            .validation_source(slug, sha, ValidationKind::Status)
    );
    observations.extend(statuses);
    let sources = vec![checks, status_source];
    let expectations: Vec<_> = work
        .expectations
        .iter()
        .filter(|e| e.repository == slug)
        .cloned()
        .collect();
    let assessments = assess_validations(&expectations, &observations, &sources, sha);
    let final_pr = service
        .github
        .get(&format!("/repos/{slug}/pulls/{number}"))
        .await?;
    if !crate::github_impact::revision_from_final(&final_pr, slug, &files.revision)? {
        return Err(error(
            "PR changed while collecting validations; evidence discarded. Refresh the dossier.",
        ));
    }
    let mut records = Vec::new();
    let mut push = |kind: &str, key: String, data: Value, sources: Vec<Provenance>| {
        records.push(WorkContextItem {
            kind: kind.into(),
            key: format!("{url}:{key}"),
            data: json!({"pr":url,"sha":sha,"value":data}),
            sources,
        });
    };
    push(
        "pr_evidence",
        "identity".into(),
        json!({
            "revision":files.revision,"revisionVerified":true,"verifiedAt":now(),
            "filesCollected":files.files.len(),"pagesCollected":files.pages_collected,
            "warnings":files.warnings,
            "limits":"Read-only evidence, not merge eligibility or proof of completion. Checks belong to the base repository at the head SHA; fork and synthetic merge checks are not combined. Observations can change after collection. No discussions, diffs or logs."
        }),
        vec![files.provenance.clone()],
    );
    for file in &files.files {
        push(
            "pr_file",
            format!("file:{}", file.path),
            serde_json::to_value(file)?,
            vec![files.provenance.clone()],
        );
    }
    let graph = service
        .db()?
        .cache(&format!("graph:{}", repo.path))?
        .map(serde_json::from_value::<Graph>)
        .transpose()?;
    if let Some(mut graph) = graph {
        for source in &mut graph.sources {
            if source.status == Availability::Available {
                source.status = Availability::Stale;
            }
        }
        let impact = detailed_impact(&graph, &files.files);
        let mut impact_sources = graph.sources;
        impact_sources.push(files.provenance.clone());
        push(
            "pr_impact",
            "impact".into(),
            json!({
                "graphWorktree":repo.path,"graphMatchesHead":false,
                "unmatched":impact.unmatched,"transversal":impact.transversal,
                "directCount":impact.direct.len(),"dependantCount":impact.dependants.len(),
                "warning":"Approximate impact from a cached working-tree graph, not an immutable PR checkout. Partial files/connectors can omit affected projects; this is not a validation guarantee."
            }),
            impact_sources.clone(),
        );
        for direct in impact.direct {
            push(
                "pr_impact_direct",
                format!("direct:{}", direct.project.id),
                serde_json::to_value(direct)?,
                impact_sources.clone(),
            );
        }
        for dependant in impact.dependants {
            push(
                "pr_impact_dependant",
                format!("dependant:{}", dependant.project.id),
                serde_json::to_value(dependant)?,
                impact_sources.clone(),
            );
        }
    } else {
        push(
            "pr_impact",
            "impact".into(),
            Value::Null,
            vec![Provenance::unavailable(
                "cached local graph",
                "Collect Architecture explicitly before exporting impact; no tools executed",
            )],
        );
    }
    push(
        "pr_validations",
        "validations".into(),
        json!({
            "repository":slug,"workRevision":work.revision,"summary":validation_summary(&assessments),
            "warning":"Local expectations, not GitHub required checks or merge eligibility. Inspect individual source availability."
        }),
        sources.clone(),
    );
    for (i, assessment) in assessments.into_iter().enumerate() {
        let mut provenance = sources.clone();
        provenance.push(crate::work_context::declared(work));
        push(
            "pr_expectation",
            format!("expectation:{i}"),
            serde_json::to_value(assessment)?,
            provenance,
        );
    }
    for observation in observations {
        push(
            "pr_validation",
            format!("validation:{}", observation.id),
            serde_json::to_value(observation)?,
            sources.clone(),
        );
    }
    Ok(records)
}
