use crate::{
    Result,
    command::git,
};
use serde_json::{Value, json};
use std::path::Path;
use worklens_core::StashEntry;

pub async fn list(root: &Path) -> Result<Vec<StashEntry>> {
    let out = git(
        root,
        &[
            "stash",
            "list",
            "--pretty=format:%gd%x00%h%x00%gs%x00%ci%x00%an%x00",
        ],
    )
    .await?;

    let mut stashes = Vec::new();
    let parts: Vec<&str> = out.split('\0').collect();
    for chunk in parts.chunks(5) {
        if chunk.len() >= 5 && !chunk[0].trim().is_empty() {
            let selector = chunk[0].trim().to_string();
            let index = selector
                .trim_start_matches("stash@{")
                .trim_end_matches('}')
                .parse::<u32>()
                .unwrap_or(0);
            let sha = chunk[1].trim().to_string();
            let message = chunk[2].trim().to_string();
            let date = chunk[3].trim().to_string();
            let author = chunk[4].trim().to_string();
            stashes.push(StashEntry {
                index,
                selector,
                sha,
                message,
                date,
                author,
            });
        }
    }
    Ok(stashes)
}

pub async fn create(
    root: &Path,
    message: Option<&str>,
    include_untracked: bool,
    keep_index: bool,
) -> Result<Value> {
    let mut args = vec!["stash", "push"];
    if include_untracked {
        args.push("--include-untracked");
    }
    if keep_index {
        args.push("--keep-index");
    }
    if let Some(msg) = message {
        if !msg.trim().is_empty() {
            args.push("-m");
            args.push(msg);
        }
    }

    let out = git(root, &args).await?;
    Ok(json!({
        "success": true,
        "action": "stash_create",
        "output": out
    }))
}

pub async fn show(root: &Path, selector: &str) -> Result<Value> {
    let diff = match git(root, &["stash", "show", "-p", "--include-untracked", selector]).await {
        Ok(d) => d,
        Err(_) => git(root, &["stash", "show", "-p", selector]).await?,
    };

    let files_raw = match git(root, &["stash", "show", "--name-only", "--include-untracked", selector]).await {
        Ok(f) => f,
        Err(_) => git(root, &["stash", "show", "--name-only", selector]).await?,
    };

    let files: Vec<String> = files_raw
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(json!({
        "selector": selector,
        "diff": diff,
        "files": files
    }))
}

pub async fn apply(root: &Path, selector: &str) -> Result<Value> {
    let out = git(root, &["stash", "apply", selector]).await?;
    Ok(json!({ "success": true, "action": "stash_apply", "output": out }))
}

pub async fn pop(root: &Path, selector: &str) -> Result<Value> {
    let out = git(root, &["stash", "pop", selector]).await?;
    Ok(json!({ "success": true, "action": "stash_pop", "output": out }))
}

pub async fn drop(root: &Path, selector: &str) -> Result<Value> {
    let out = git(root, &["stash", "drop", selector]).await?;
    Ok(json!({ "success": true, "action": "stash_drop", "output": out }))
}

pub async fn clear(root: &Path) -> Result<Value> {
    let out = git(root, &["stash", "clear"]).await?;
    Ok(json!({ "success": true, "action": "stash_clear", "output": out }))
}
