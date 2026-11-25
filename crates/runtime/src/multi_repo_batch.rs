use crate::command::{git, run};
use serde_json::Value;
use std::{path::Path, sync::Arc};
use tokio::sync::Semaphore;
use worklens_core::{BatchOperationResult, BatchReport, MultiRepoWorkspace, WorkspaceRepoEntry};

pub async fn execute_batch(
    workspace: &MultiRepoWorkspace,
    action: &str,
    params: &Value,
) -> BatchReport {
    let semaphore = Arc::new(Semaphore::new(5));
    let mut tasks = Vec::new();

    let target_branch = params["branch"]
        .as_str()
        .or_else(|| params["targetBranch"].as_str())
        .map(str::to_string);

    for repo in &workspace.repos {
        let repo = repo.clone();
        let action = action.to_string();
        let target_branch = target_branch.clone();
        let sem = semaphore.clone();

        tasks.push(tokio::spawn(async move {
            let _permit = sem.acquire().await;
            match action.as_str() {
                "fetch" => batch_fetch(&repo).await,
                "pull" => batch_pull(&repo).await,
                "clone" => batch_clone(&repo).await,
                "checkout" => {
                    let branch = target_branch.as_deref().unwrap_or("main");
                    batch_checkout(&repo, branch).await
                }
                other => BatchOperationResult {
                    operation: other.to_string(),
                    repo_id: repo.id,
                    repo_name: repo.name,
                    success: false,
                    message: format!("Unknown action: {other}"),
                },
            }
        }));
    }

    let mut results = Vec::new();
    for task in tasks {
        if let Ok(res) = task.await {
            results.push(res);
        }
    }

    let total = results.len();
    let succeeded = results.iter().filter(|r| r.success).count();
    let failed = total - succeeded;

    BatchReport {
        operation: action.to_string(),
        total,
        succeeded,
        failed,
        results,
    }
}

async fn batch_fetch(repo: &WorkspaceRepoEntry) -> BatchOperationResult {
    let path = Path::new(&repo.path);
    if !path.is_dir() {
        return BatchOperationResult {
            operation: "fetch".into(),
            repo_id: repo.id.clone(),
            repo_name: repo.name.clone(),
            success: false,
            message: "Repository not found locally".into(),
        };
    }

    match git(path, &["fetch", "--all", "--prune"]).await {
        Ok(output) => {
            let msg = if output.trim().is_empty() {
                "Fetched remotes (up to date)".into()
            } else {
                output
                    .trim()
                    .lines()
                    .take(3)
                    .collect::<Vec<_>>()
                    .join(" · ")
            };
            BatchOperationResult {
                operation: "fetch".into(),
                repo_id: repo.id.clone(),
                repo_name: repo.name.clone(),
                success: true,
                message: msg,
            }
        }
        Err(e) => BatchOperationResult {
            operation: "fetch".into(),
            repo_id: repo.id.clone(),
            repo_name: repo.name.clone(),
            success: false,
            message: e.to_string(),
        },
    }
}

async fn batch_pull(repo: &WorkspaceRepoEntry) -> BatchOperationResult {
    let path = Path::new(&repo.path);
    if !path.is_dir() {
        return BatchOperationResult {
            operation: "pull".into(),
            repo_id: repo.id.clone(),
            repo_name: repo.name.clone(),
            success: false,
            message: "Repository not found locally".into(),
        };
    }

    // Check if dirty before pulling to avoid merge conflicts
    if let Ok(status) = git(path, &["status", "--porcelain=v1"]).await {
        if !status.trim().is_empty() {
            return BatchOperationResult {
                operation: "pull".into(),
                repo_id: repo.id.clone(),
                repo_name: repo.name.clone(),
                success: false,
                message: "Skipped: repository has uncommitted local changes".into(),
            };
        }
    }

    match git(path, &["pull", "--ff-only"]).await {
        Ok(output) => {
            let msg = if output.trim().is_empty() {
                "Already up to date".into()
            } else {
                output
                    .trim()
                    .lines()
                    .take(2)
                    .collect::<Vec<_>>()
                    .join(" · ")
            };
            BatchOperationResult {
                operation: "pull".into(),
                repo_id: repo.id.clone(),
                repo_name: repo.name.clone(),
                success: true,
                message: msg,
            }
        }
        Err(e) => BatchOperationResult {
            operation: "pull".into(),
            repo_id: repo.id.clone(),
            repo_name: repo.name.clone(),
            success: false,
            message: e.to_string(),
        },
    }
}

async fn batch_clone(repo: &WorkspaceRepoEntry) -> BatchOperationResult {
    let path = Path::new(&repo.path);
    if path.is_dir() && path.join(".git").exists() {
        return BatchOperationResult {
            operation: "clone".into(),
            repo_id: repo.id.clone(),
            repo_name: repo.name.clone(),
            success: true,
            message: "Repository already exists locally".into(),
        };
    }

    let remote_url = match &repo.remote_url {
        Some(url) if !url.trim().is_empty() => url.trim(),
        _ => {
            return BatchOperationResult {
                operation: "clone".into(),
                repo_id: repo.id.clone(),
                repo_name: repo.name.clone(),
                success: false,
                message: "No remote URL configured for clone".into(),
            };
        }
    };

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let parent = path.parent().unwrap_or(path);
    let target_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&repo.name);

    match run(parent, "git", &["clone", remote_url, target_name]).await {
        Ok(_) => BatchOperationResult {
            operation: "clone".into(),
            repo_id: repo.id.clone(),
            repo_name: repo.name.clone(),
            success: true,
            message: "Cloned successfully".into(),
        },
        Err(e) => BatchOperationResult {
            operation: "clone".into(),
            repo_id: repo.id.clone(),
            repo_name: repo.name.clone(),
            success: false,
            message: format!("Clone failed: {e}"),
        },
    }
}

async fn batch_checkout(repo: &WorkspaceRepoEntry, branch: &str) -> BatchOperationResult {
    let path = Path::new(&repo.path);
    if !path.is_dir() {
        return BatchOperationResult {
            operation: "checkout".into(),
            repo_id: repo.id.clone(),
            repo_name: repo.name.clone(),
            success: false,
            message: "Repository not found locally".into(),
        };
    }

    match git(path, &["checkout", branch]).await {
        Ok(_) => BatchOperationResult {
            operation: "checkout".into(),
            repo_id: repo.id.clone(),
            repo_name: repo.name.clone(),
            success: true,
            message: format!("Switched to branch {branch}"),
        },
        Err(e) => BatchOperationResult {
            operation: "checkout".into(),
            repo_id: repo.id.clone(),
            repo_name: repo.name.clone(),
            success: false,
            message: format!("Checkout {branch} failed: {e}"),
        },
    }
}
