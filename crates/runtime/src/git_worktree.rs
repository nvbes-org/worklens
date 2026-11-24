use crate::{
    Result,
    command::git,
    error,
};
use serde_json::{Value, json};
use std::path::Path;

pub async fn add(
    root: &Path,
    path: &str,
    branch: Option<&str>,
    new_branch: Option<&str>,
) -> Result<Value> {
    if path.trim().is_empty() {
        return Err(error("Worktree path cannot be empty"));
    }

    let mut args = vec!["worktree", "add"];
    if let Some(nb) = new_branch {
        if !nb.trim().is_empty() {
            args.push("-b");
            args.push(nb);
        }
    }
    args.push(path);
    if let Some(b) = branch {
        if !b.trim().is_empty() && new_branch.is_none() {
            args.push(b);
        }
    }

    let out = git(root, &args).await?;
    Ok(json!({
        "success": true,
        "action": "worktree_add",
        "path": path,
        "output": out
    }))
}

pub async fn remove(root: &Path, path: &str, force: bool) -> Result<Value> {
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(path);
    let out = git(root, &args).await?;
    Ok(json!({
        "success": true,
        "action": "worktree_remove",
        "path": path,
        "output": out
    }))
}

pub async fn lock(root: &Path, path: &str, reason: Option<&str>) -> Result<Value> {
    let mut args = vec!["worktree", "lock"];
    if let Some(r) = reason {
        if !r.trim().is_empty() {
            args.push("--reason");
            args.push(r);
        }
    }
    args.push(path);
    let out = git(root, &args).await?;
    Ok(json!({
        "success": true,
        "action": "worktree_lock",
        "path": path,
        "output": out
    }))
}

pub async fn unlock(root: &Path, path: &str) -> Result<Value> {
    let out = git(root, &["worktree", "unlock", path]).await?;
    Ok(json!({
        "success": true,
        "action": "worktree_unlock",
        "path": path,
        "output": out
    }))
}

pub async fn prune(root: &Path) -> Result<Value> {
    let out = git(root, &["worktree", "prune"]).await?;
    Ok(json!({
        "success": true,
        "action": "worktree_prune",
        "output": out
    }))
}
