use crate::{Result, error, github::Github};
use serde_json::json;
use worklens_core::{BoundaryViolation, ImpactCommentResult, PrImpact};

pub const IMPACT_COMMENT_TAG: &str = "<!-- worklens:pr-impact-summary -->";

pub fn format_impact_markdown(impact: &PrImpact, violations: &[BoundaryViolation]) -> String {
    let mut md = String::new();
    md.push_str("## 🔍 Worklens Architecture & Impact Summary\n");
    md.push_str(IMPACT_COMMENT_TAG);
    md.push_str("\n\n");

    let head_sha = &impact.collection.revision.head_sha;
    let short_sha = if head_sha.len() >= 7 {
        &head_sha[..7]
    } else {
        head_sha
    };
    md.push_str(&format!(
        "> Analyzed commit **`{short_sha}`** • **{}** changed files\n\n",
        impact.collection.files.len()
    ));

    // Boundary status
    if violations.is_empty() {
        md.push_str("### 🛡️ Architecture Boundaries: **Passed** ✅\n");
        md.push_str("No layer boundary violations or forbidden dependencies detected.\n\n");
    } else {
        md.push_str(&format!(
            "### 🛡️ Architecture Boundaries: **Failed** ❌ ({} violation(s))\n\n",
            violations.len()
        ));
        md.push_str("| Source Layer | Target Layer | Source Project | Target Project | Message |\n");
        md.push_str("| :--- | :--- | :--- | :--- | :--- |\n");
        for v in violations {
            md.push_str(&format!(
                "| `{}` | `{}` | `{}` | `{}` | {} |\n",
                v.source_layer, v.target_layer, v.source_project, v.target_project, v.message
            ));
        }
        md.push('\n');
    }

    // Direct impact
    md.push_str("### 📦 Directly Affected Projects\n");
    if impact.impact.direct.is_empty() {
        md.push_str("*No specific projects directly affected (or changes outside defined projects).*\n\n");
    } else {
        for direct in &impact.impact.direct {
            md.push_str(&format!(
                "- **`{}`** (`{}`)\n",
                direct.project.name, direct.project.root
            ));
        }
        md.push('\n');
    }

    // Dependents impact
    md.push_str("### 🔄 Dependent Projects (Transitive Impact)\n");
    if impact.impact.dependants.is_empty() {
        md.push_str("*No downstream dependent projects impacted.*\n\n");
    } else {
        for dep in &impact.impact.dependants {
            md.push_str(&format!(
                "- **`{}`** (via {})\n",
                dep.project.name, dep.via.source
            ));
        }
        md.push('\n');
    }

    // Transversal files
    if !impact.impact.transversal.is_empty() {
        md.push_str("### ⚙️ Transversal / Root Changes\n");
        for path in &impact.impact.transversal {
            md.push_str(&format!("- `{path}`\n"));
        }
        md.push('\n');
    }

    md.push_str("---\n*Generated automatically by [Worklens](https://worklens.dev)*\n");
    md
}

pub async fn post_or_update_impact_comment(
    github: &Github,
    repo_slug: &str,
    number: u64,
    body: &str,
) -> Result<ImpactCommentResult> {
    let comments_endpoint = format!("/repos/{repo_slug}/issues/{number}/comments");

    let existing_comments = github.get(&comments_endpoint).await?;
    let mut existing_comment_id = None;

    if let Some(arr) = existing_comments.as_array() {
        for comment in arr {
            if let Some(comment_body) = comment["body"].as_str() {
                if comment_body.contains(IMPACT_COMMENT_TAG) {
                    if let Some(id) = comment["id"].as_u64() {
                        existing_comment_id = Some(id);
                        break;
                    }
                }
            }
        }
    }

    if let Some(comment_id) = existing_comment_id {
        let patch_endpoint = format!("/repos/{repo_slug}/issues/comments/{comment_id}");
        let res = github.patch(&patch_endpoint, &json!({ "body": body })).await?;
        let html_url = res["html_url"].as_str().unwrap_or_default().to_string();
        Ok(ImpactCommentResult {
            comment_id,
            html_url,
            action: "updated".into(),
        })
    } else {
        let res = github.post(&comments_endpoint, &json!({ "body": body })).await?;
        let comment_id = res["id"]
            .as_u64()
            .ok_or_else(|| error("GitHub comment ID missing from response"))?;
        let html_url = res["html_url"].as_str().unwrap_or_default().to_string();
        Ok(ImpactCommentResult {
            comment_id,
            html_url,
            action: "created".into(),
        })
    }
}
