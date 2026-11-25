use crate::{
    Result,
    command::{git, run},
    error,
};
use serde_json::{Value, json};
use std::path::Path;
use worklens_core::{LargeFileCandidate, LfsFile, LfsLock, LfsStatus};

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{} B", bytes)
    }
}

pub async fn status(root: &Path) -> Result<LfsStatus> {
    let version_out = run(root, "git-lfs", &["version"]).await.or_else(|_| {
        // try git lfs version
        std::process::Command::new("git")
            .arg("lfs")
            .arg("version")
            .current_dir(root)
            .output()
            .map(|o| o.stdout)
            .map_err(|e| error(e.to_string()))
    });

    let (installed, version) = match version_out {
        Ok(v) => {
            let s = String::from_utf8_lossy(&v).trim().to_string();
            (true, s)
        }
        Err(_) => (false, String::new()),
    };

    let mut patterns = Vec::new();
    let gitattributes = root.join(".gitattributes");
    if let Ok(content) = tokio::fs::read_to_string(gitattributes).await {
        for line in content.lines() {
            let line = line.trim();
            if line.contains("filter=lfs") {
                if let Some(pattern) = line.split_whitespace().next() {
                    patterns.push(pattern.to_string());
                }
            }
        }
    }

    let mut files = Vec::new();
    if installed {
        if let Ok(out) = git(root, &["lfs", "ls-files", "--size"]).await {
            // output format: <oid> * <path> (<size> B)
            for line in out.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let oid = parts[0].to_string();
                    let path = parts[2].to_string();
                    let size_bytes = if let Some(open) = line.rfind('(')
                        && let Some(close) = line.rfind(')')
                    {
                        let inner = &line[open + 1..close];
                        inner
                            .split_whitespace()
                            .next()
                            .and_then(|s| s.parse::<u64>().ok())
                            .unwrap_or(0)
                    } else {
                        0
                    };
                    files.push(LfsFile {
                        path,
                        oid,
                        size_bytes,
                        formatted_size: format_bytes(size_bytes),
                    });
                }
            }
        }
    }

    let lfs_locks = if installed {
        locks(root).await.unwrap_or_default()
    } else {
        Vec::new()
    };

    Ok(LfsStatus {
        installed,
        version,
        patterns,
        files,
        locks: lfs_locks,
    })
}

pub async fn locks(root: &Path) -> Result<Vec<LfsLock>> {
    let out = git(root, &["lfs", "locks"]).await.unwrap_or_default();
    let mut locks = Vec::new();
    for line in out.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        // format typically: <path> <owner> ID:<id>
        if parts.len() >= 3 {
            let path = parts[0].to_string();
            let owner = parts[1].to_string();
            let id = parts[2].trim_start_matches("ID:").to_string();
            locks.push(LfsLock {
                id,
                path,
                owner,
                locked_at: String::new(),
            });
        }
    }
    Ok(locks)
}

pub async fn track(root: &Path, pattern: &str) -> Result<Value> {
    if pattern.trim().is_empty() {
        return Err(error("Pattern cannot be empty"));
    }
    let res = git(root, &["lfs", "track", pattern]).await;
    let out = match res {
        Ok(out) => out,
        Err(_) => {
            let attrs_path = root.join(".gitattributes");
            let mut content = tokio::fs::read_to_string(&attrs_path).await.unwrap_or_default();
            let entry = format!("{} filter=lfs diff=lfs merge=lfs -text\n", pattern.trim());
            if !content.contains(pattern.trim()) {
                content.push_str(&entry);
                tokio::fs::write(&attrs_path, content).await?;
            }
            format!("Tracking \"{}\" (written to .gitattributes)", pattern.trim())
        }
    };
    Ok(json!({ "success": true, "action": "lfs_track", "pattern": pattern, "output": out }))
}

pub async fn untrack(root: &Path, pattern: &str) -> Result<Value> {
    if pattern.trim().is_empty() {
        return Err(error("Pattern cannot be empty"));
    }
    let res = git(root, &["lfs", "untrack", pattern]).await;
    let out = match res {
        Ok(out) => out,
        Err(_) => {
            let attrs_path = root.join(".gitattributes");
            if let Ok(content) = tokio::fs::read_to_string(&attrs_path).await {
                let filtered: Vec<&str> = content
                    .lines()
                    .filter(|l| !l.starts_with(pattern.trim()))
                    .collect();
                tokio::fs::write(&attrs_path, filtered.join("\n")).await?;
            }
            format!("Untracking \"{}\"", pattern.trim())
        }
    };
    Ok(json!({ "success": true, "action": "lfs_untrack", "pattern": pattern, "output": out }))
}

pub async fn lock(root: &Path, path: &str) -> Result<Value> {
    let out = git(root, &["lfs", "lock", path]).await?;
    Ok(json!({ "success": true, "action": "lfs_lock", "path": path, "output": out }))
}

pub async fn unlock(root: &Path, path: &str, force: bool) -> Result<Value> {
    let mut args = vec!["lfs", "unlock"];
    if force {
        args.push("--force");
    }
    args.push(path);
    let out = git(root, &args).await?;
    Ok(json!({ "success": true, "action": "lfs_unlock", "path": path, "output": out }))
}

pub async fn scan_large_files(root: &Path, threshold_mb: u64) -> Result<Vec<LargeFileCandidate>> {
    let min_bytes = threshold_mb.max(1) * 1024 * 1024;
    let mut candidates = Vec::new();
    let current_lfs = status(root).await.ok();
    let tracked_set: std::collections::HashSet<String> = current_lfs
        .as_ref()
        .map(|s| s.files.iter().map(|f| f.path.clone()).collect())
        .unwrap_or_default();

    let mut stack = vec![root.to_path_buf()];
    let binary_extensions = [
        "psd", "zip", "tar.gz", "tgz", "mp4", "mov", "bin", "onnx", "pt", "weights", "iso", "dmg",
        "sqlite", "db", "wasm", "pdf", "glb", "gltf", "fbx", "obj",
    ];

    while let Some(dir) = stack.pop() {
        let mut entries = match tokio::fs::read_dir(&dir).await {
            Ok(e) => e,
            Err(_) => continue,
        };

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if file_name.starts_with('.')
                || file_name == "node_modules"
                || file_name == "target"
                || file_name == "vendor"
                || file_name == "dist"
                || file_name == "build"
            {
                continue;
            }

            if let Ok(meta) = entry.metadata().await {
                if meta.is_dir() {
                    stack.push(path);
                } else if meta.is_file() {
                    let len = meta.len();
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();
                    let is_binary_heavy = binary_extensions.contains(&ext.as_str());

                    if len >= min_bytes || (is_binary_heavy && len >= 500 * 1024) {
                        let rel = path
                            .strip_prefix(root)
                            .unwrap_or(&path)
                            .to_string_lossy()
                            .to_string();
                        let is_lfs_tracked = tracked_set.contains(&rel);
                        candidates.push(LargeFileCandidate {
                            path: rel,
                            size_bytes: len,
                            formatted_size: format_bytes(len),
                            is_lfs_tracked,
                        });
                        if candidates.len() >= 200 {
                            break;
                        }
                    }
                }
            }
        }
    }

    candidates.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    Ok(candidates)
}
