use std::collections::HashSet;
use worklens_core::{CloudDeploymentPipeline, CloudProvider};

pub fn parse_workflow_file(rel_path: &str, content: &str) -> Option<CloudDeploymentPipeline> {
    let lower = content.to_ascii_lowercase();

    // Only consider workflows that contain deployment, release, infra, or cloud actions
    let has_deploy = lower.contains("deploy")
        || lower.contains("publish")
        || lower.contains("release")
        || lower.contains("terraform")
        || lower.contains("tofu")
        || lower.contains("aws-actions")
        || lower.contains("google-github-actions")
        || lower.contains("scaleway")
        || lower.contains("docker/build-push")
        || lower.contains("environment:");

    if !has_deploy {
        return None;
    }

    let mut name = String::new();
    let mut triggers = Vec::new();
    let mut environments = HashSet::new();
    let mut detected_actions = Vec::new();
    let mut deploy_jobs = Vec::new();
    let mut secrets_used = HashSet::new();
    let mut providers_set = HashSet::new();
    let mut is_iac = false;

    let lines: Vec<&str> = content.lines().collect();
    let mut in_on_block = false;
    let mut on_indent = 0;

    for line in lines {
        let trimmed = line.trim();
        let indent = line.len() - line.trim_start().len();

        // 1. Workflow Name
        if trimmed.starts_with("name:") && name.is_empty() {
            name = trimmed.trim_start_matches("name:").trim().trim_matches('"').trim_matches('\'').to_string();
        }

        // 2. Triggers ('on:')
        if trimmed == "on:" || trimmed.starts_with("on: ") {
            if trimmed.starts_with("on: [") {
                let list = trimmed.trim_start_matches("on: [").trim_end_matches(']');
                for t in list.split(',') {
                    let clean = t.trim().trim_matches('"').trim_matches('\'');
                    if !clean.is_empty() {
                        triggers.push(clean.to_string());
                    }
                }
            } else if trimmed.starts_with("on: ") {
                triggers.push(trimmed.trim_start_matches("on:").trim().to_string());
            } else {
                in_on_block = true;
                on_indent = indent;
            }
        } else if in_on_block {
            if indent <= on_indent && !trimmed.is_empty() {
                in_on_block = false;
            } else if trimmed.ends_with(':') && !trimmed.starts_with('-') {
                let t_name = trimmed.trim_end_matches(':').trim();
                triggers.push(t_name.to_string());
            }
        }

        // 3. Jobs tracking
        if indent == 2 && trimmed.ends_with(':') && !trimmed.starts_with('-') {
            let current_job = trimmed.trim_end_matches(':').trim().to_string();
            let cj_lower = current_job.to_ascii_lowercase();
            if cj_lower.contains("deploy") || cj_lower.contains("publish") || cj_lower.contains("release") || cj_lower.contains("infra") {
                deploy_jobs.push(current_job.clone());
            }
        }

        // 4. Environments
        if trimmed.starts_with("environment:") {
            let env_val = trimmed.trim_start_matches("environment:").trim().trim_matches('"').trim_matches('\'');
            if !env_val.is_empty() && !env_val.contains('{') {
                environments.insert(env_val.to_string());
            }
        }

        // 5. Actions detection
        if trimmed.starts_with("uses:") {
            let action = trimmed.trim_start_matches("uses:").trim().trim_matches('"').trim_matches('\'');
            let action_name = action.split('@').next().unwrap_or(action).to_string();
            let a_lower = action_name.to_ascii_lowercase();

            if a_lower.contains("aws") {
                providers_set.insert(CloudProvider::Aws);
                detected_actions.push(action_name.clone());
            } else if a_lower.contains("google") || a_lower.contains("gcloud") {
                providers_set.insert(CloudProvider::Gcp);
                detected_actions.push(action_name.clone());
            } else if a_lower.contains("scaleway") || a_lower.contains("scw") {
                providers_set.insert(CloudProvider::Scaleway);
                detected_actions.push(action_name.clone());
            } else if a_lower.contains("terraform") || a_lower.contains("opentofu") {
                is_iac = true;
                detected_actions.push(action_name.clone());
            } else if a_lower.contains("docker") || a_lower.contains("kubectl") || a_lower.contains("helm") {
                detected_actions.push(action_name.clone());
            }
        }

        // 6. Inline run commands inspection
        if trimmed.starts_with("run:") || trimmed.starts_with("- run:") {
            let cmd = trimmed.to_ascii_lowercase();
            if cmd.contains("terraform") || cmd.contains("tofu") {
                is_iac = true;
            }
            if cmd.contains("aws ") || cmd.contains("serverless deploy") || cmd.contains("sam deploy") {
                providers_set.insert(CloudProvider::Aws);
            }
            if cmd.contains("gcloud ") || cmd.contains("gsutil ") {
                providers_set.insert(CloudProvider::Gcp);
            }
            if cmd.contains("scw ") {
                providers_set.insert(CloudProvider::Scaleway);
            }
        }

        // 7. Secrets detection (${{ secrets.XYZ }})
        let mut rem = trimmed;
        while let Some(pos) = rem.find("secrets.") {
            let after = &rem[pos + 8..];
            let secret_name: String = after.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
            if !secret_name.is_empty() {
                secrets_used.insert(secret_name.clone());
                let sn_lower = secret_name.to_ascii_lowercase();
                if sn_lower.contains("aws") {
                    providers_set.insert(CloudProvider::Aws);
                } else if sn_lower.contains("gcp") || sn_lower.contains("google") {
                    providers_set.insert(CloudProvider::Gcp);
                } else if sn_lower.contains("scw") || sn_lower.contains("scaleway") {
                    providers_set.insert(CloudProvider::Scaleway);
                }
            }
            rem = after;
        }
    }

    if name.is_empty() {
        name = rel_path.split('/').last().unwrap_or(rel_path).replace(".yml", "").replace(".yaml", "");
    }

    let mut provs: Vec<CloudProvider> = providers_set.into_iter().collect();
    provs.sort_by_key(|p| match p {
        CloudProvider::Aws => 1,
        CloudProvider::Gcp => 2,
        CloudProvider::Scaleway => 3,
        CloudProvider::Azure => 4,
        CloudProvider::Other(_) => 5,
    });

    let mut envs: Vec<String> = environments.into_iter().collect();
    envs.sort();

    let mut secrets: Vec<String> = secrets_used.into_iter().collect();
    secrets.sort();

    Some(CloudDeploymentPipeline {
        id: rel_path.to_string(),
        name,
        file_path: rel_path.to_string(),
        providers: provs,
        triggers,
        environments: envs,
        detected_actions,
        deploy_jobs,
        secrets_used: secrets,
        is_iac,
    })
}

#[cfg(test)]
#[path = "cloud_cicd.tests.rs"]
mod tests;
