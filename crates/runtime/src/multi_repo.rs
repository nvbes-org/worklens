use crate::{
    Result, error,
    command::git,
    service::{Service, text},
};
use serde_json::Value;
use std::path::Path;
use worklens_core::{MultiRepoStatus, MultiRepoWorkspace, RepoGitStatus, WorkspaceRepoEntry};

pub async fn dispatch(service: &Service, operation: &worklens_core::Operation, p: &Value) -> Result<Value> {
    match operation {
        worklens_core::Operation::MultiRepoList => {
            let list = service.db()?.list_multi_workspaces()?;
            Ok(serde_json::to_value(list)?)
        }
        worklens_core::Operation::MultiRepoGet => {
            let id = text(p, "id")?;
            let ws = service
                .db()?
                .get_multi_workspace(id)?
                .ok_or_else(|| error("Workspace not found"))?;
            Ok(serde_json::to_value(ws)?)
        }
        worklens_core::Operation::MultiRepoSave => {
            let val = if p.get("workspace").is_some() {
                &p["workspace"]
            } else {
                p
            };
            let workspace: MultiRepoWorkspace = serde_json::from_value(val.clone())?;
            if workspace.name.trim().is_empty() {
                return Err(error("Workspace name cannot be empty"));
            }
            service.db()?.save_multi_workspace(&workspace)?;
            Ok(serde_json::to_value(workspace)?)
        }
        worklens_core::Operation::MultiRepoDelete => {
            let id = text(p, "id")?;
            let deleted = service.db()?.delete_multi_workspace(id)?;
            Ok(serde_json::json!({ "deleted": deleted, "id": id }))
        }
        worklens_core::Operation::MultiRepoStatus => {
            let id = text(p, "id")?;
            let ws = service
                .db()?
                .get_multi_workspace(id)?
                .ok_or_else(|| error("Workspace not found"))?;
            let status = workspace_status(&ws).await;
            Ok(serde_json::to_value(status)?)
        }
        worklens_core::Operation::MultiRepoBatch => {
            let id = text(p, "id")?;
            let action = text(p, "action")?;
            let ws = service
                .db()?
                .get_multi_workspace(id)?
                .ok_or_else(|| error("Workspace not found"))?;
            let report = crate::multi_repo_batch::execute_batch(&ws, action, p).await;
            Ok(serde_json::to_value(report)?)
        }
        _ => Err(error("Invalid multi-repo operation")),
    }
}

pub async fn check_repo_status(entry: &WorkspaceRepoEntry) -> RepoGitStatus {
    let path = Path::new(&entry.path);
    if !path.is_dir() {
        return RepoGitStatus {
            repo_id: entry.id.clone(),
            name: entry.name.clone(),
            path: entry.path.clone(),
            exists: false,
            current_branch: None,
            tracking_branch: None,
            ahead: 0,
            behind: 0,
            is_dirty: false,
            staged_count: 0,
            unstaged_count: 0,
            untracked_count: 0,
            conflicted_count: 0,
            last_commit_sha: None,
            last_commit_message: None,
            last_commit_author: None,
            last_commit_timestamp: None,
            error: Some("Directory not found".into()),
        };
    }

    // Check if it's a valid git repository
    let git_check = git(path, &["rev-parse", "--is-inside-work-tree"]).await;
    if git_check.is_err() {
        return RepoGitStatus {
            repo_id: entry.id.clone(),
            name: entry.name.clone(),
            path: entry.path.clone(),
            exists: false,
            current_branch: None,
            tracking_branch: None,
            ahead: 0,
            behind: 0,
            is_dirty: false,
            staged_count: 0,
            unstaged_count: 0,
            untracked_count: 0,
            conflicted_count: 0,
            last_commit_sha: None,
            last_commit_message: None,
            last_commit_author: None,
            last_commit_timestamp: None,
            error: Some("Not a git repository".into()),
        };
    }

    // Current branch
    let current_branch = match git(path, &["symbolic-ref", "--short", "HEAD"]).await {
        Ok(b) => Some(b.trim().to_string()),
        Err(_) => git(path, &["rev-parse", "--short", "HEAD"])
            .await
            .ok()
            .map(|sha| format!("(detached: {})", sha.trim())),
    };

    // Tracking branch
    let tracking_branch = git(path, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
        .await
        .ok()
        .map(|tb| tb.trim().to_string())
        .filter(|s| !s.is_empty());

    // Ahead / behind count
    let (ahead, behind) = if tracking_branch.is_some() {
        match git(path, &["rev-list", "--left-right", "--count", "HEAD...@{u}"]).await {
            Ok(output) => {
                let parts: Vec<&str> = output.trim().split_whitespace().collect();
                if parts.len() >= 2 {
                    let a = parts[0].parse::<u32>().unwrap_or(0);
                    let b = parts[1].parse::<u32>().unwrap_or(0);
                    (a, b)
                } else {
                    (0, 0)
                }
            }
            Err(_) => (0, 0),
        }
    } else {
        (0, 0)
    };

    // Status porcelain for dirty detection
    let mut staged_count = 0;
    let mut unstaged_count = 0;
    let mut untracked_count = 0;
    let mut conflicted_count = 0;

    if let Ok(status_output) = git(path, &["status", "--porcelain=v1", "-uall"]).await {
        for line in status_output.lines() {
            if line.len() < 2 {
                continue;
            }
            let index_status = line.chars().next().unwrap_or(' ');
            let worktree_status = line.chars().nth(1).unwrap_or(' ');

            if index_status == '?' && worktree_status == '?' {
                untracked_count += 1;
            } else if index_status == 'U' || worktree_status == 'U' || (index_status == 'A' && worktree_status == 'A') {
                conflicted_count += 1;
            } else {
                if index_status != ' ' {
                    staged_count += 1;
                }
                if worktree_status != ' ' {
                    unstaged_count += 1;
                }
            }
        }
    }

    let is_dirty = staged_count > 0 || unstaged_count > 0 || untracked_count > 0 || conflicted_count > 0;

    // Last commit details
    let (last_commit_sha, last_commit_message, last_commit_author, last_commit_timestamp) =
        match git(path, &["log", "-n", "1", "--format=%h\x1f%s\x1f%an\x1f%aI"]).await {
            Ok(log_output) => {
                let fields: Vec<&str> = log_output.trim().split('\x1f').collect();
                if fields.len() >= 4 {
                    (
                        Some(fields[0].to_string()),
                        Some(fields[1].to_string()),
                        Some(fields[2].to_string()),
                        Some(fields[3].to_string()),
                    )
                } else {
                    (None, None, None, None)
                }
            }
            Err(_) => (None, None, None, None),
        };

    RepoGitStatus {
        repo_id: entry.id.clone(),
        name: entry.name.clone(),
        path: entry.path.clone(),
        exists: true,
        current_branch,
        tracking_branch,
        ahead,
        behind,
        is_dirty,
        staged_count,
        unstaged_count,
        untracked_count,
        conflicted_count,
        last_commit_sha,
        last_commit_message,
        last_commit_author,
        last_commit_timestamp,
        error: None,
    }
}

pub async fn workspace_status(workspace: &MultiRepoWorkspace) -> MultiRepoStatus {
    let mut handles = Vec::new();
    for repo in &workspace.repos {
        let repo_clone = repo.clone();
        handles.push(tokio::spawn(async move {
            check_repo_status(&repo_clone).await
        }));
    }

    let mut repo_statuses = Vec::new();
    for handle in handles {
        if let Ok(status) = handle.await {
            repo_statuses.push(status);
        }
    }

    let total_repos = repo_statuses.len();
    let missing_repos = repo_statuses.iter().filter(|r| !r.exists).count();
    let clean_repos = repo_statuses
        .iter()
        .filter(|r| r.exists && !r.is_dirty && r.ahead == 0 && r.behind == 0)
        .count();
    let dirty_repos = repo_statuses.iter().filter(|r| r.is_dirty).count();
    let ahead_repos = repo_statuses.iter().filter(|r| r.ahead > 0).count();
    let behind_repos = repo_statuses.iter().filter(|r| r.behind > 0).count();

    MultiRepoStatus {
        workspace_id: workspace.id.clone(),
        repos: repo_statuses,
        total_repos,
        clean_repos,
        dirty_repos,
        ahead_repos,
        behind_repos,
        missing_repos,
    }
}
