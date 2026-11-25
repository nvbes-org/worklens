use crate::{
    Result,
    command::{git, git_with_stdin},
    error,
};
use serde_json::Value;
use std::path::Path;
use worklens_core::ReflogEntry;

pub async fn execute_action(root: &Path, params: &Value) -> Result<Value> {
    let action = params["action"]
        .as_str()
        .ok_or_else(|| error("Missing action"))?;
    match action {
        "stage_file" => {
            let path = params["path"]
                .as_str()
                .ok_or_else(|| error("Missing path"))?;
            git(root, &["add", "--", path]).await?;
            Ok(serde_json::json!({ "success": true, "action": "stage_file", "path": path }))
        }
        "unstage_file" => {
            let path = params["path"]
                .as_str()
                .ok_or_else(|| error("Missing path"))?;
            git(root, &["restore", "--staged", "--", path]).await?;
            Ok(serde_json::json!({ "success": true, "action": "unstage_file", "path": path }))
        }
        "discard_file" => {
            let path = params["path"]
                .as_str()
                .ok_or_else(|| error("Missing path"))?;
            let untracked = params["untracked"].as_bool().unwrap_or(false);
            if untracked {
                git(root, &["clean", "-f", "--", path]).await?;
            } else {
                git(root, &["restore", "--", path]).await?;
            }
            Ok(serde_json::json!({ "success": true, "action": "discard_file", "path": path }))
        }
        "stage_all" => {
            git(root, &["add", "-A"]).await?;
            Ok(serde_json::json!({ "success": true, "action": "stage_all" }))
        }
        "unstage_all" => {
            git(root, &["reset"]).await?;
            Ok(serde_json::json!({ "success": true, "action": "unstage_all" }))
        }
        "stage_patch" => {
            let patch = params["patch"]
                .as_str()
                .ok_or_else(|| error("Missing patch"))?;
            git_with_stdin(
                root,
                &["apply", "--cached", "--unidiff-zero", "-"],
                patch.as_bytes(),
            )
            .await?;
            Ok(serde_json::json!({ "success": true, "action": "stage_patch" }))
        }
        "unstage_patch" => {
            let patch = params["patch"]
                .as_str()
                .ok_or_else(|| error("Missing patch"))?;
            git_with_stdin(
                root,
                &["apply", "--cached", "--reverse", "--unidiff-zero", "-"],
                patch.as_bytes(),
            )
            .await?;
            Ok(serde_json::json!({ "success": true, "action": "unstage_patch" }))
        }
        "discard_patch" => {
            let patch = params["patch"]
                .as_str()
                .ok_or_else(|| error("Missing patch"))?;
            git_with_stdin(
                root,
                &["apply", "--reverse", "--unidiff-zero", "-"],
                patch.as_bytes(),
            )
            .await?;
            Ok(serde_json::json!({ "success": true, "action": "discard_patch" }))
        }
        "commit" => {
            let message = params["message"]
                .as_str()
                .ok_or_else(|| error("Missing commit message"))?;
            let amend = params["amend"].as_bool().unwrap_or(false);
            if amend {
                git(root, &["commit", "--amend", "-m", message]).await?;
            } else {
                git(root, &["commit", "-m", message]).await?;
            }
            Ok(serde_json::json!({ "success": true, "action": "commit", "amend": amend }))
        }
        "merge" => {
            let branch = params["branch"]
                .as_str()
                .ok_or_else(|| error("Missing branch to merge"))?;
            let mode = params["mode"].as_str().unwrap_or("default");
            let mut args = vec!["merge"];
            match mode {
                "ff_only" => args.push("--ff-only"),
                "no_ff" => args.push("--no-ff"),
                _ => {}
            }
            args.push(branch);
            let out = git(root, &args).await?;
            Ok(serde_json::json!({ "success": true, "action": "merge", "output": out }))
        }
        "rebase" => {
            let upstream = params["upstream"]
                .as_str()
                .ok_or_else(|| error("Missing upstream branch to rebase onto"))?;
            let out = git(root, &["rebase", upstream]).await?;
            Ok(serde_json::json!({ "success": true, "action": "rebase", "output": out }))
        }
        "checkout" => {
            let branch = params["branch"]
                .as_str()
                .ok_or_else(|| error("Missing branch to checkout"))?;
            let out = git(root, &["checkout", branch]).await?;
            Ok(serde_json::json!({ "success": true, "action": "checkout", "output": out }))
        }
        "push" => {
            let remote = params["remote"].as_str().unwrap_or("origin");
            let branch = params["branch"].as_str();
            let force = params["force"].as_bool().unwrap_or(false);
            let mut args = vec!["push"];
            if force {
                args.push("--force-with-lease");
            }
            args.push(remote);
            if let Some(b) = branch {
                args.push(b);
            }
            let out = git(root, &args).await?;
            Ok(serde_json::json!({ "success": true, "action": "push", "output": out }))
        }
        "reset" => {
            let target = params["target"].as_str().unwrap_or("HEAD~1");
            let mode = params["mode"].as_str().unwrap_or("soft");
            let flag = match mode {
                "hard" => "--hard",
                "mixed" => "--mixed",
                _ => "--soft",
            };
            let out = git(root, &["reset", flag, target]).await?;
            Ok(serde_json::json!({ "success": true, "action": "reset", "output": out }))
        }
        "cherry_pick" => {
            let sha = params["sha"]
                .as_str()
                .ok_or_else(|| error("Missing commit SHA for cherry-pick"))?;
            let no_commit = params["no_commit"].as_bool().unwrap_or(false);
            let mut args = vec!["cherry-pick"];
            if no_commit {
                args.push("-n");
            }
            args.push(sha);
            match git(root, &args).await {
                Ok(out) => Ok(serde_json::json!({ "success": true, "action": "cherry_pick", "sha": sha, "output": out })),
                Err(err) => {
                    let git_dir_str = git(root, &["rev-parse", "--git-dir"]).await.unwrap_or_default();
                    let cherry_head = root.join(git_dir_str.trim()).join("CHERRY_PICK_HEAD");
                    let has_conflict = cherry_head.exists();
                    Ok(serde_json::json!({
                        "success": false,
                        "conflict": has_conflict,
                        "action": "cherry_pick",
                        "error": err.to_string()
                    }))
                }
            }
        }
        "cherry_pick_abort" => {
            let out = git(root, &["cherry-pick", "--abort"]).await?;
            Ok(serde_json::json!({ "success": true, "action": "cherry_pick_abort", "output": out }))
        }
        "cherry_pick_continue" => {
            let out = git(root, &["cherry-pick", "--continue"]).await?;
            Ok(serde_json::json!({ "success": true, "action": "cherry_pick_continue", "output": out }))
        }
        "cherry_pick_status" => {
            let git_dir_str = git(root, &["rev-parse", "--git-dir"]).await.unwrap_or_default();
            let cherry_head = root.join(git_dir_str.trim()).join("CHERRY_PICK_HEAD");
            let in_progress = cherry_head.exists();
            let head_sha = if in_progress {
                tokio::fs::read_to_string(&cherry_head).await.ok().map(|s| s.trim().to_string())
            } else {
                None
            };
            Ok(serde_json::json!({ "in_progress": in_progress, "sha": head_sha }))
        }
        "rebase_status" => {
            let s = crate::git_rebase::status(root).await?;
            Ok(serde_json::to_value(s)?)
        }
        "rebase_commits" => {
            let upstream = params["upstream"].as_str().unwrap_or("HEAD~5");
            let c = crate::git_rebase::commits(root, upstream).await?;
            Ok(serde_json::to_value(c)?)
        }
        "rebase_apply" => {
            let upstream = params["upstream"]
                .as_str()
                .ok_or_else(|| error("Missing upstream for rebase"))?;
            let items: Vec<worklens_core::RebaseItem> = serde_json::from_value(
                params
                    .get("items")
                    .cloned()
                    .ok_or_else(|| error("Missing items for rebase"))?,
            )?;
            crate::git_rebase::apply(root, upstream, &items).await
        }
        "rebase_abort" => crate::git_rebase::abort(root).await,
        "rebase_continue" => crate::git_rebase::continue_rebase(root).await,
        "rebase_skip" => crate::git_rebase::skip(root).await,
        "stash_list" => {
            let s = crate::git_stash::list(root).await?;
            Ok(serde_json::to_value(s)?)
        }
        "stash_create" => {
            let msg = params["message"].as_str();
            let untracked = params["include_untracked"].as_bool().unwrap_or(false);
            let keep_index = params["keep_index"].as_bool().unwrap_or(false);
            crate::git_stash::create(root, msg, untracked, keep_index).await
        }
        "stash_show" => {
            let sel = params["selector"]
                .as_str()
                .ok_or_else(|| error("Missing selector"))?;
            crate::git_stash::show(root, sel).await
        }
        "stash_apply" => {
            let sel = params["selector"]
                .as_str()
                .ok_or_else(|| error("Missing selector"))?;
            crate::git_stash::apply(root, sel).await
        }
        "stash_pop" => {
            let sel = params["selector"]
                .as_str()
                .ok_or_else(|| error("Missing selector"))?;
            crate::git_stash::pop(root, sel).await
        }
        "stash_drop" => {
            let sel = params["selector"]
                .as_str()
                .ok_or_else(|| error("Missing selector"))?;
            crate::git_stash::drop(root, sel).await
        }
        "stash_clear" => crate::git_stash::clear(root).await,
        "worktree_add" => {
            let path = params["path"]
                .as_str()
                .ok_or_else(|| error("Missing worktree path"))?;
            let branch = params["branch"].as_str();
            let new_branch = params["new_branch"].as_str();
            crate::git_worktree::add(root, path, branch, new_branch).await
        }
        "worktree_remove" => {
            let path = params["path"]
                .as_str()
                .ok_or_else(|| error("Missing worktree path"))?;
            let force = params["force"].as_bool().unwrap_or(false);
            crate::git_worktree::remove(root, path, force).await
        }
        "worktree_lock" => {
            let path = params["path"]
                .as_str()
                .ok_or_else(|| error("Missing worktree path"))?;
            let reason = params["reason"].as_str();
            crate::git_worktree::lock(root, path, reason).await
        }
        "worktree_unlock" => {
            let path = params["path"]
                .as_str()
                .ok_or_else(|| error("Missing worktree path"))?;
            crate::git_worktree::unlock(root, path).await
        }
        "worktree_prune" => crate::git_worktree::prune(root).await,
        "lfs_status" => {
            let s = crate::git_lfs::status(root).await?;
            Ok(serde_json::to_value(s)?)
        }
        "lfs_scan_large_files" => {
            let mb = params["threshold_mb"].as_u64().unwrap_or(5);
            let files = crate::git_lfs::scan_large_files(root, mb).await?;
            Ok(serde_json::to_value(files)?)
        }
        "lfs_track" => {
            let pat = params["pattern"]
                .as_str()
                .ok_or_else(|| error("Missing pattern"))?;
            crate::git_lfs::track(root, pat).await
        }
        "lfs_untrack" => {
            let pat = params["pattern"]
                .as_str()
                .ok_or_else(|| error("Missing pattern"))?;
            crate::git_lfs::untrack(root, pat).await
        }
        "lfs_locks" => {
            let locks = crate::git_lfs::locks(root).await?;
            Ok(serde_json::to_value(locks)?)
        }
        "lfs_lock" => {
            let path = params["path"]
                .as_str()
                .ok_or_else(|| error("Missing path to lock"))?;
            crate::git_lfs::lock(root, path).await
        }
        "lfs_unlock" => {
            let path = params["path"]
                .as_str()
                .ok_or_else(|| error("Missing path to unlock"))?;
            let force = params["force"].as_bool().unwrap_or(false);
            crate::git_lfs::unlock(root, path, force).await
        }
        "submodule_list" => {
            let subs = crate::git_submodules::list(root).await?;
            Ok(serde_json::to_value(subs)?)
        }
        "submodule_init" => {
            let path = params["path"].as_str();
            crate::git_submodules::init(root, path).await
        }
        "submodule_update" => {
            let path = params["path"].as_str();
            let recursive = params["recursive"].as_bool().unwrap_or(true);
            let init = params["init"].as_bool().unwrap_or(true);
            crate::git_submodules::update(root, path, recursive, init).await
        }
        "submodule_sync" => {
            let recursive = params["recursive"].as_bool().unwrap_or(true);
            crate::git_submodules::sync(root, recursive).await
        }
        "submodule_add" => {
            let url = params["url"]
                .as_str()
                .ok_or_else(|| error("Missing repository URL for submodule"))?;
            let path = params["path"].as_str();
            crate::git_submodules::add(root, url, path).await
        }
        "submodule_deinit" => {
            let path = params["path"]
                .as_str()
                .ok_or_else(|| error("Missing submodule path"))?;
            let force = params["force"].as_bool().unwrap_or(false);
            crate::git_submodules::deinit(root, path, force).await
        }
        "signing_status" => {
            let s = crate::git_signing::signing_status(root).await?;
            Ok(serde_json::to_value(s)?)
        }
        "signing_config" => {
            let gpg_sign = params["gpg_sign"].as_bool().unwrap_or(false);
            let format = params["format"].as_str();
            let key = params["signing_key"].as_str();
            crate::git_signing::signing_config(root, gpg_sign, format, key).await
        }
        "ssh_keys_list" => {
            let keys = crate::git_signing::ssh_keys_list(root).await?;
            Ok(serde_json::to_value(keys)?)
        }
        "ssh_key_generate" => {
            let email = params["email"].as_str().unwrap_or("");
            let name = params["name"]
                .as_str()
                .ok_or_else(|| error("Missing key name"))?;
            let key_type = params["key_type"].as_str().unwrap_or("ed25519");
            let set_as_signing = params["set_as_signing"].as_bool().unwrap_or(true);
            crate::git_signing::ssh_key_generate(email, name, key_type, set_as_signing, root).await
        }
        other => crate::git_commands::execute(root, other, params).await,
    }
}

pub async fn reflog(root: &Path, limit: u32) -> Result<Vec<ReflogEntry>> {
    let limit_str = format!("-{}", limit.clamp(1, 100));
    let out = git(
        root,
        &["reflog", &limit_str, "--format=%H%x00%gd%x00%gs%x00%ci"],
    )
    .await?;
    let mut entries = Vec::new();
    for line in out.lines() {
        let parts: Vec<&str> = line.split('\0').collect();
        if parts.len() == 4 {
            entries.push(ReflogEntry {
                sha: parts[0].to_string(),
                selector: parts[1].to_string(),
                action: parts[2].to_string(),
                date: parts[3].to_string(),
            });
        }
    }
    Ok(entries)
}

pub async fn commit_files(root: &Path, sha: &str) -> Result<Vec<String>> {
    let out = git(
        root,
        &["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", sha],
    )
    .await?;
    Ok(out
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect())
}
