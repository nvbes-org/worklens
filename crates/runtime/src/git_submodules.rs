use crate::{
    Result,
    command::git,
    error,
};
use serde_json::{Value, json};
use std::path::Path;
use worklens_core::SubmoduleEntry;

pub async fn list(root: &Path) -> Result<Vec<SubmoduleEntry>> {
    let gitmodules = root.join(".gitmodules");
    if !gitmodules.exists() {
        return Ok(Vec::new());
    }

    let status_out = git(root, &["submodule", "status", "--recursive"])
        .await
        .unwrap_or_default();

    // Map of path -> (status_char, commit, branch_hint)
    let mut statuses = std::collections::HashMap::new();
    for line in status_out.lines() {
        let trimmed = line.trim_start();
        if trimmed.is_empty() {
            continue;
        }
        let status_char = line.chars().next().unwrap_or(' ');
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() >= 2 {
            let commit = parts[0].trim_start_matches(|c| c == '-' || c == '+' || c == 'U');
            let path = parts[1];
            let branch = if parts.len() >= 3 && parts[2].starts_with('(') {
                Some(parts[2].trim_matches(|c| c == '(' || c == ')').to_string())
            } else {
                None
            };
            statuses.insert(path.to_string(), (status_char, commit.to_string(), branch));
        }
    }

    let config_out = git(
        root,
        &[
            "config",
            "--file",
            ".gitmodules",
            "--get-regexp",
            "^submodule\\..*\\.(path|url|branch)",
        ],
    )
    .await
    .unwrap_or_default();

    // Group by submodule name
    let mut submodules_map: std::collections::HashMap<String, (String, String, Option<String>)> =
        std::collections::HashMap::new();

    for line in config_out.lines() {
        if let Some((key, val)) = line.split_once(' ') {
            let parts: Vec<&str> = key.split('.').collect();
            if parts.len() >= 3 {
                let name = parts[1].to_string();
                let field = parts[2];
                let entry = submodules_map
                    .entry(name)
                    .or_insert_with(|| (String::new(), String::new(), None));
                match field {
                    "path" => entry.0 = val.trim().to_string(),
                    "url" => entry.1 = val.trim().to_string(),
                    "branch" => entry.2 = Some(val.trim().to_string()),
                    _ => {}
                }
            }
        }
    }

    let mut result = Vec::new();
    for (name, (path, url, branch)) in submodules_map {
        let (status_char, commit, status_branch) = statuses
            .get(&path)
            .cloned()
            .unwrap_or((' ', String::new(), None));

        let status = match status_char {
            '-' => "uninitialized",
            '+' => "modified",
            'U' => "conflict",
            _ => "up_to_date",
        };

        let sub_git = root.join(&path).join(".git");
        let initialized = status != "uninitialized" && (sub_git.exists() || sub_git.is_file());

        result.push(SubmoduleEntry {
            name,
            path,
            url,
            commit,
            branch: branch.or(status_branch),
            status: status.to_string(),
            initialized,
        });
    }

    result.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(result)
}

pub async fn init(root: &Path, path: Option<&str>) -> Result<Value> {
    let mut args = vec!["submodule", "init"];
    if let Some(p) = path {
        args.push("--");
        args.push(p);
    }
    let out = git(root, &args).await?;
    Ok(json!({ "success": true, "action": "submodule_init", "output": out }))
}

pub async fn update(
    root: &Path,
    path: Option<&str>,
    recursive: bool,
    init: bool,
) -> Result<Value> {
    let mut args = vec!["submodule", "update"];
    if init {
        args.push("--init");
    }
    if recursive {
        args.push("--recursive");
    }
    if let Some(p) = path {
        args.push("--");
        args.push(p);
    }
    let out = git(root, &args).await?;
    Ok(json!({ "success": true, "action": "submodule_update", "output": out }))
}

pub async fn sync(root: &Path, recursive: bool) -> Result<Value> {
    let mut args = vec!["submodule", "sync"];
    if recursive {
        args.push("--recursive");
    }
    let out = git(root, &args).await?;
    Ok(json!({ "success": true, "action": "submodule_sync", "output": out }))
}

pub async fn add(root: &Path, url: &str, path: Option<&str>) -> Result<Value> {
    if url.trim().is_empty() {
        return Err(error("Submodule repository URL cannot be empty"));
    }
    let mut args = vec!["submodule", "add", url];
    if let Some(p) = path {
        if !p.trim().is_empty() {
            args.push(p);
        }
    }
    let out = git(root, &args).await?;
    Ok(json!({ "success": true, "action": "submodule_add", "output": out }))
}

pub async fn deinit(root: &Path, path: &str, force: bool) -> Result<Value> {
    let mut args = vec!["submodule", "deinit"];
    if force {
        args.push("-f");
    }
    args.push("--");
    args.push(path);
    let out = git(root, &args).await?;
    Ok(json!({ "success": true, "action": "submodule_deinit", "path": path, "output": out }))
}
