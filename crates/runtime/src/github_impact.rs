use crate::{
    Result, error,
    github::{Github, valid_slug},
};
use serde_json::Value;
use std::{collections::BTreeSet, time::Duration};
use tokio::time::{Instant, timeout, timeout_at};
use worklens_core::*;

fn revision(pr: &Value, repo: &str) -> Result<PrRevision> {
    let sha = |key: &str| -> Result<String> {
        let value = pr[key]["sha"]
            .as_str()
            .ok_or_else(|| error("PR SHA missing"))?;
        if value.len() != 40 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(error("Invalid PR SHA"));
        }
        Ok(value.into())
    };
    let head_repository = pr["head"]["repo"]["full_name"].as_str().map(str::to_owned);
    if head_repository.as_deref().is_some_and(|s| !valid_slug(s)) {
        return Err(error("Invalid head repository"));
    }
    Ok(PrRevision {
        base_repository: repo.into(),
        head_repository,
        base_sha: sha("base")?,
        head_sha: sha("head")?,
        expected_files: pr["changed_files"]
            .as_u64()
            .and_then(|v| v.try_into().ok())
            .ok_or_else(|| error("PR file count missing"))?,
    })
}
fn file(value: &Value) -> Result<PrChangedFile> {
    let path = |key: &str| -> Result<String> {
        let p = value[key]
            .as_str()
            .ok_or_else(|| error("PR file path missing"))?;
        if p.is_empty()
            || p.len() > 4096
            || p.starts_with('/')
            || p.split('/').any(|p| p == ".." || p == ".")
            || p.contains('\0')
        {
            return Err(error("Invalid PR file path"));
        }
        Ok(p.into())
    };
    let status = value["status"]
        .as_str()
        .ok_or_else(|| error("PR file status missing"))?
        .to_owned();
    if ![
        "added",
        "removed",
        "modified",
        "renamed",
        "copied",
        "changed",
        "unchanged",
    ]
    .contains(&status.as_str())
    {
        return Err(error("Unknown PR file status"));
    }
    let previous_path = if status == "renamed" || value.get("previous_filename").is_some() {
        Some(path("previous_filename")?)
    } else {
        None
    };
    Ok(PrChangedFile {
        path: path("filename")?,
        previous_path,
        status,
    })
}

impl Github {
    pub async fn collect_pr_files(&self, repo: &str, number: u64) -> Result<PrFileCollection> {
        if !valid_slug(repo) || number == 0 {
            return Err(error("Select a GitHub repository and positive PR number"));
        }
        let endpoint = format!("/repos/{repo}/pulls/{number}");
        let deadline = Instant::now() + Duration::from_secs(60);
        let initial = self.get(&endpoint).await?;
        let revision = revision(&initial, repo)?;
        let mut result = PrFileCollection {
            revision,
            files: Vec::new(),
            pages_collected: 0,
            revision_verified: false,
            provenance: Provenance::observed(&format!("GitHub {repo} PR #{number} files")),
            warnings: Vec::new(),
        };
        let mut seen = BTreeSet::new();
        let expected = result.revision.expected_files.min(3000);
        for page in 1..=expected.div_ceil(100) {
            let response = match timeout_at(
                deadline,
                self.get(&format!("{endpoint}/files?per_page=100&page={page}")),
            )
            .await
            {
                Ok(Ok(value)) => value,
                Ok(Err(e)) => {
                    result.warnings.push(format!("Page {page}: {e}"));
                    break;
                }
                Err(_) => {
                    result
                        .warnings
                        .push(format!("Collection deadline reached before page {page}"));
                    break;
                }
            };
            let Some(rows) = response.as_array() else {
                result.warnings.push("Invalid file page response".into());
                break;
            };
            let mut page_files = Vec::new();
            let mut invalid = false;
            for row in rows {
                match file(row) {
                    Ok(f) if seen.insert(f.path.clone()) => page_files.push(f),
                    _ => {
                        invalid = true;
                        break;
                    }
                }
            }
            if invalid || rows.len() > 100 {
                result
                    .warnings
                    .push(format!("Page {page} contains invalid or duplicate files"));
                break;
            }
            result.files.extend(page_files);
            result.pages_collected += 1;
            if rows.len() < 100 {
                break;
            }
        }
        if result.revision.expected_files > 3000 {
            result
                .warnings
                .push("GitHub limits PR file listings to 3000 files".into());
        }
        match timeout(Duration::from_secs(10), self.get(&endpoint)).await {
            Ok(Ok(final_pr)) => match revision_from_final(&final_pr, repo, &result.revision) {
                Ok(true) => result.revision_verified = true,
                _ => {
                    result.files.clear();
                    result.warnings.push("PR revision changed or could not be verified; mixed file data discarded. Refresh the analysis.".into());
                }
            },
            _ => result
                .warnings
                .push("Final PR revision check unavailable; file set is not verified".into()),
        }
        if result.files.len() != result.revision.expected_files as usize {
            result.warnings.push(format!(
                "Collected {} of {} expected files",
                result.files.len(),
                result.revision.expected_files
            ));
        }
        result.provenance.collected_at = worklens_core::now();
        result.provenance.revision = Some(format!(
            "{}..{}",
            result.revision.base_sha, result.revision.head_sha
        ));
        result.provenance.status = if result.warnings.is_empty() && result.revision_verified {
            Availability::Available
        } else {
            Availability::Partial
        };
        result.provenance.detail =
            (!result.warnings.is_empty()).then(|| result.warnings.join("; "));
        Ok(result)
    }
}
pub(crate) fn revision_from_final(pr: &Value, repo: &str, expected: &PrRevision) -> Result<bool> {
    Ok(&revision(pr, repo)? == expected)
}
