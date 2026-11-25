use crate::{
    Result,
    command::{git, git_with_env},
    error,
};
use serde_json::{Value, json};
use std::path::Path;
use worklens_core::{RebaseItem, RebaseStatus};

pub async fn status(root: &Path) -> Result<RebaseStatus> {
    let git_dir_str = git(root, &["rev-parse", "--git-dir"]).await?;
    let git_dir = root.join(git_dir_str.trim());
    let rebase_merge = git_dir.join("rebase-merge");
    let rebase_apply = git_dir.join("rebase-apply");

    let (in_progress, dir) = if rebase_merge.is_dir() {
        (true, Some(rebase_merge))
    } else if rebase_apply.is_dir() {
        (true, Some(rebase_apply))
    } else {
        (false, None)
    };

    if !in_progress || dir.is_none() {
        return Ok(RebaseStatus {
            in_progress: false,
            current_commit: None,
            onto: None,
            branch: None,
            step: None,
            total: None,
        });
    }

    let d = dir.unwrap();
    let current_commit = tokio::fs::read_to_string(d.join("stopped-sha"))
        .await
        .ok()
        .map(|s| s.trim().to_string());
    let onto = tokio::fs::read_to_string(d.join("onto"))
        .await
        .ok()
        .map(|s| s.trim().to_string());
    let branch = tokio::fs::read_to_string(d.join("head-name"))
        .await
        .ok()
        .map(|s| s.trim().replace("refs/heads/", ""));
    let step = tokio::fs::read_to_string(d.join("msgnum"))
        .await
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok());
    let total = tokio::fs::read_to_string(d.join("end"))
        .await
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok());

    Ok(RebaseStatus {
        in_progress: true,
        current_commit,
        onto,
        branch,
        step,
        total,
    })
}

pub async fn commits(root: &Path, upstream: &str) -> Result<Vec<RebaseItem>> {
    let rev_range = format!("{upstream}..HEAD");
    let out = git(
        root,
        &[
            "log",
            "--reverse",
            "--format=%H%x00%an%x00%aI%x00%s%x00%b%x00",
            &rev_range,
        ],
    )
    .await?;

    let mut items = Vec::new();
    let parts: Vec<&str> = out.split('\0').collect();
    for chunk in parts.chunks(5) {
        if chunk.len() >= 4 && !chunk[0].trim().is_empty() {
            let sha = chunk[0].trim().to_string();
            let author = chunk[1].trim().to_string();
            let date = chunk[2].trim().to_string();
            let subject = chunk[3].trim().to_string();
            let body = if chunk.len() > 4 {
                chunk[4].trim().to_string()
            } else {
                String::new()
            };
            items.push(RebaseItem {
                sha,
                action: "pick".to_string(),
                author,
                date,
                subject,
                message: if body.is_empty() { None } else { Some(body) },
            });
        }
    }
    Ok(items)
}

pub async fn apply(root: &Path, upstream: &str, items: &[RebaseItem]) -> Result<Value> {
    if items.is_empty() {
        return Err(error("Cannot rebase an empty list of commits"));
    }

    let mut todo_content = String::new();
    for item in items {
        let action = match item.action.as_str() {
            "squash" | "s" => "squash",
            "fixup" | "f" => "fixup",
            "drop" | "d" => "drop",
            "edit" | "e" => "edit",
            "reword" | "r" => "reword",
            _ => "pick",
        };

        if action == "reword" && let Some(msg) = &item.message && !msg.trim().is_empty() {
            let escaped = msg.replace('"', "\\\"").replace('\n', " ");
            todo_content.push_str(&format!("pick {} {}\n", item.sha, item.subject));
            todo_content.push_str(&format!(
                "exec git commit --amend --allow-empty -m \"{}\"\n",
                escaped
            ));
        } else {
            todo_content.push_str(&format!("{} {} {}\n", action, item.sha, item.subject));
        }
    }

    let todo_dir = crate::paths::data_dir()?;
    tokio::fs::create_dir_all(&todo_dir).await?;
    let todo_file = todo_dir.join("worklens-rebase-todo.txt");
    tokio::fs::write(&todo_file, &todo_content).await?;

    let editor_cmd = format!("cp {}", todo_file.to_string_lossy());
    let out = git_with_env(
        root,
        &["rebase", "-i", upstream],
        &[("GIT_SEQUENCE_EDITOR", &editor_cmd)],
    )
    .await?;

    let _ = tokio::fs::remove_file(todo_file).await;

    Ok(json!({
        "success": true,
        "action": "rebase_apply",
        "output": out
    }))
}

pub async fn abort(root: &Path) -> Result<Value> {
    let out = git(root, &["rebase", "--abort"]).await?;
    Ok(json!({ "success": true, "action": "rebase_abort", "output": out }))
}

pub async fn continue_rebase(root: &Path) -> Result<Value> {
    let out = git(root, &["rebase", "--continue"]).await?;
    Ok(json!({ "success": true, "action": "rebase_continue", "output": out }))
}

pub async fn skip(root: &Path) -> Result<Value> {
    let out = git(root, &["rebase", "--skip"]).await?;
    Ok(json!({ "success": true, "action": "rebase_skip", "output": out }))
}
