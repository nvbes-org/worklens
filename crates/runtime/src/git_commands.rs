use crate::{Result, command::git, error};
use serde_json::Value;
use std::path::Path;

pub async fn execute(root: &Path, action: &str, params: &Value) -> Result<Value> {
    match action {
        "fetch" => {
            let remote = params["remote"].as_str();
            let prune = params["prune"].as_bool().unwrap_or(true);
            let mut args = vec!["fetch"];
            if prune {
                args.push("--prune");
            }
            if let Some(r) = remote {
                args.push(r);
            } else {
                args.push("--all");
            }
            let out = git(root, &args).await?;
            Ok(serde_json::json!({ "success": true, "action": "fetch", "output": out }))
        }
        "pull" => {
            let remote = params["remote"].as_str().unwrap_or("origin");
            let branch = params["branch"].as_str();
            let rebase = params["rebase"].as_bool().unwrap_or(false);
            let ff_only = params["ff_only"].as_bool().unwrap_or(false);
            let mut args = vec!["pull"];
            if rebase {
                args.push("--rebase");
            } else if ff_only {
                args.push("--ff-only");
            }
            args.push(remote);
            if let Some(b) = branch {
                args.push(b);
            }
            let out = git(root, &args).await?;
            Ok(serde_json::json!({ "success": true, "action": "pull", "output": out }))
        }
        "branch_create" => {
            let name = params["name"]
                .as_str()
                .ok_or_else(|| error("Missing branch name"))?;
            let start = params["start_point"].as_str();
            let checkout = params["checkout"].as_bool().unwrap_or(false);
            let mut args = if checkout {
                vec!["checkout", "-b", name]
            } else {
                vec!["branch", name]
            };
            if let Some(s) = start {
                args.push(s);
            }
            let out = git(root, &args).await?;
            Ok(serde_json::json!({
                "success": true,
                "action": "branch_create",
                "branch": name,
                "output": out
            }))
        }
        "branch_delete" => {
            let name = params["name"]
                .as_str()
                .ok_or_else(|| error("Missing branch name to delete"))?;
            let force = params["force"].as_bool().unwrap_or(false);
            let flag = if force { "-D" } else { "-d" };
            let out = git(root, &["branch", flag, name]).await?;
            Ok(serde_json::json!({
                "success": true,
                "action": "branch_delete",
                "branch": name,
                "output": out
            }))
        }
        "branch_rename" => {
            let new_name = params["new_name"]
                .as_str()
                .ok_or_else(|| error("Missing new branch name"))?;
            let old_name = params["old_name"].as_str();
            let mut args = vec!["branch", "-m"];
            if let Some(old) = old_name {
                args.push(old);
            }
            args.push(new_name);
            let out = git(root, &args).await?;
            Ok(serde_json::json!({
                "success": true,
                "action": "branch_rename",
                "newName": new_name,
                "output": out
            }))
        }
        "tag_create" => {
            let name = params["name"]
                .as_str()
                .ok_or_else(|| error("Missing tag name"))?;
            let message = params["message"].as_str();
            let target = params["target"].as_str();
            let mut args = vec!["tag"];
            if let Some(msg) = message {
                args.push("-a");
                args.push(name);
                args.push("-m");
                args.push(msg);
            } else {
                args.push(name);
            }
            if let Some(t) = target {
                args.push(t);
            }
            let out = git(root, &args).await?;
            Ok(serde_json::json!({
                "success": true,
                "action": "tag_create",
                "tag": name,
                "output": out
            }))
        }
        "tag_delete" => {
            let name = params["name"]
                .as_str()
                .ok_or_else(|| error("Missing tag name to delete"))?;
            let out = git(root, &["tag", "-d", name]).await?;
            Ok(serde_json::json!({
                "success": true,
                "action": "tag_delete",
                "tag": name,
                "output": out
            }))
        }
        "remote_add" => {
            let name = params["name"]
                .as_str()
                .ok_or_else(|| error("Missing remote name"))?;
            let url = params["url"]
                .as_str()
                .ok_or_else(|| error("Missing remote URL"))?;
            let out = git(root, &["remote", "add", name, url]).await?;
            Ok(serde_json::json!({
                "success": true,
                "action": "remote_add",
                "name": name,
                "url": url,
                "output": out
            }))
        }
        "remote_remove" => {
            let name = params["name"]
                .as_str()
                .ok_or_else(|| error("Missing remote name to remove"))?;
            let out = git(root, &["remote", "remove", name]).await?;
            Ok(serde_json::json!({
                "success": true,
                "action": "remote_remove",
                "name": name,
                "output": out
            }))
        }
        "revert" => {
            let sha = params["sha"]
                .as_str()
                .ok_or_else(|| error("Missing commit SHA to revert"))?;
            let no_commit = params["no_commit"].as_bool().unwrap_or(false);
            let mut args = vec!["revert"];
            if no_commit {
                args.push("-n");
            } else {
                args.push("--no-edit");
            }
            args.push(sha);
            let out = git(root, &args).await?;
            Ok(serde_json::json!({
                "success": true,
                "action": "revert",
                "sha": sha,
                "output": out
            }))
        }
        "clean" => {
            let out = git(root, &["clean", "-f", "-d"]).await?;
            Ok(serde_json::json!({ "success": true, "action": "clean", "output": out }))
        }
        "raw_command" => {
            let cmd = params["command"]
                .as_str()
                .ok_or_else(|| error("Missing git command"))?
                .trim();
            // Disallow command chaining, redirection or dangerous operations
            if cmd.contains(';') || cmd.contains('|') || cmd.contains('&') || cmd.contains('>') || cmd.contains('<') {
                return Err(error("Command chaining and shell redirection are not allowed"));
            }
            let trimmed = cmd.strip_prefix("git ").unwrap_or(cmd);
            let tokens: Vec<&str> = trimmed.split_whitespace().collect();
            if tokens.is_empty() {
                return Err(error("Empty git command"));
            }
            let out = git(root, &tokens).await?;
            Ok(serde_json::json!({
                "success": true,
                "action": "raw_command",
                "command": cmd,
                "output": out
            }))
        }
        other => Err(error(format!("Unknown git command action: {other}"))),
    }
}
