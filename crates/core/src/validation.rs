use crate::{Availability, Provenance};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[cfg(test)]
#[path = "validation.tests.rs"]
mod tests;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ValidationKind {
    Check,
    Status,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ValidationExpectation {
    pub repository: String,
    pub kind: ValidationKind,
    pub name: String,
    #[ts(type = "number | null")]
    pub app_id: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ValidationOutcome {
    Success,
    Failure,
    Pending,
    Cancelled,
    Skipped,
    Neutral,
    TimedOut,
    ActionRequired,
    Unknown,
    Missing,
    Ambiguous,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ValidationObservation {
    pub id: String,
    pub kind: ValidationKind,
    pub name: String,
    #[ts(type = "number | null")]
    pub app_id: Option<u64>,
    pub sha: String,
    pub outcome: ValidationOutcome,
    pub raw_state: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ValidationAssessment {
    pub expectation: ValidationExpectation,
    pub outcome: ValidationOutcome,
    pub matches: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub repository: String,
    pub sha: String,
    pub work_revision: Option<u32>,
    pub observations: Vec<ValidationObservation>,
    pub assessments: Vec<ValidationAssessment>,
    pub sources: Vec<Provenance>,
    pub summary: String,
    pub warnings: Vec<String>,
}

pub fn assess_validations(
    expectations: &[ValidationExpectation],
    observations: &[ValidationObservation],
    sources: &[Provenance],
    sha: &str,
) -> Vec<ValidationAssessment> {
    expectations
        .iter()
        .map(|expectation| {
            let matches: Vec<_> = observations
                .iter()
                .filter(|o| {
                    o.sha == sha
                        && o.kind == expectation.kind
                        && o.name == expectation.name
                        && expectation.app_id.is_none_or(|id| o.app_id == Some(id))
                })
                .collect();
            let source = match expectation.kind {
                ValidationKind::Check => "GitHub checks",
                ValidationKind::Status => "GitHub statuses",
            };
            let complete = sources.iter().any(|s| {
                s.source == source
                    && s.status == Availability::Available
                    && s.revision.as_deref() == Some(sha)
            });
            let outcome = if !complete {
                ValidationOutcome::Unknown
            } else {
                match matches.as_slice() {
                    [] => ValidationOutcome::Missing,
                    [one] => one.outcome.clone(),
                    _ => ValidationOutcome::Ambiguous,
                }
            };
            ValidationAssessment {
                expectation: expectation.clone(),
                outcome,
                matches: matches.iter().map(|o| o.id.clone()).collect(),
            }
        })
        .collect()
}

pub fn validation_summary(assessments: &[ValidationAssessment]) -> String {
    if assessments.is_empty() {
        "not_configured"
    } else if assessments
        .iter()
        .all(|a| a.outcome == ValidationOutcome::Success)
    {
        "satisfied"
    } else if assessments.iter().any(|a| {
        matches!(
            a.outcome,
            ValidationOutcome::Unknown | ValidationOutcome::Ambiguous
        )
    }) {
        "unknown"
    } else {
        "attention"
    }
    .into()
}
