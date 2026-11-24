use crate::{Result, error, paths};
use serde_json::Value;
use std::{
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
    time::Instant,
};
use tokio::sync::Semaphore;
use worklens_core::{FolderSizeEntry, FolderSizeReport};

struct ScanNode {
    name: String,
    rel_path: String,
    size_bytes: u64,
    is_dir: bool,
    file_count: u64,
    dir_count: u64,
    children: Vec<ScanNode>,
}

pub async fn scan(root: &Path, params: &Value) -> Result<Value> {
    let start = Instant::now();
    let subpath = params["subpath"].as_str().unwrap_or("");
    let max_depth = params["maxDepth"].as_u64().unwrap_or(4).min(5) as usize;
    let include_hidden = params["includeHidden"].as_bool().unwrap_or(true);

    let target_dir = if subpath.is_empty() || subpath == "." {
        root.to_path_buf()
    } else {
        paths::confined(root, subpath)?
    };

    if !target_dir.is_dir() {
        return Err(error("Target path is not a directory"));
    }

    let sem = Arc::new(Semaphore::new(64));
    let base_root = root.to_path_buf();
    let root_node = scan_dir(target_dir, base_root, sem, include_hidden, 0).await?;

    let mut all_files = Vec::new();
    let mut all_dirs = Vec::new();
    collect_flat(&root_node, &mut all_files, &mut all_dirs);

    all_files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
    all_dirs.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));

    let top_largest_files = all_files
        .into_iter()
        .take(25)
        .map(|node| FolderSizeEntry {
            name: node.name.clone(),
            path: node.rel_path.clone(),
            size_bytes: node.size_bytes,
            is_dir: false,
            file_count: 0,
            dir_count: 0,
            children: None,
        })
        .collect();

    let top_largest_dirs = all_dirs
        .into_iter()
        .take(25)
        .map(|node| FolderSizeEntry {
            name: node.name.clone(),
            path: node.rel_path.clone(),
            size_bytes: node.size_bytes,
            is_dir: true,
            file_count: node.file_count,
            dir_count: node.dir_count,
            children: None,
        })
        .collect();

    let total_bytes = root_node.size_bytes;
    let total_files = root_node.file_count;
    let total_dirs = root_node.dir_count;
    let tree = prune_to_depth(root_node, 0, max_depth);

    let report = FolderSizeReport {
        root_path: if subpath.is_empty() { ".".into() } else { subpath.into() },
        total_bytes,
        total_files,
        total_dirs,
        duration_ms: start.elapsed().as_millis() as u64,
        tree,
        top_largest_files,
        top_largest_dirs,
    };

    Ok(serde_json::to_value(report)?)
}

fn scan_dir(
    dir: PathBuf,
    root: PathBuf,
    sem: Arc<Semaphore>,
    include_hidden: bool,
    current_depth: usize,
) -> Pin<Box<dyn Future<Output = Result<ScanNode>> + Send>> {
    Box::pin(async move {
        let permit = sem.acquire().await.map_err(|_| error("Scan semaphore closed"))?;
        let read_result = tokio::fs::read_dir(&dir).await;
        drop(permit);

        let mut entries = match read_result {
            Ok(e) => e,
            Err(_) => {
                let name = dir
                    .file_name()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_else(|| ".".into());
                let rel_path = dir
                    .strip_prefix(&root)
                    .unwrap_or(&dir)
                    .to_string_lossy()
                    .to_string();
                return Ok(ScanNode {
                    name,
                    rel_path,
                    size_bytes: 0,
                    is_dir: true,
                    file_count: 0,
                    dir_count: 0,
                    children: Vec::new(),
                });
            }
        };

        let mut subdirs = Vec::new();
        let mut files = Vec::new();
        let mut total_bytes = 0u64;
        let mut file_count = 0u64;
        let mut dir_count = 0u64;

        while let Ok(Some(entry)) = entries.next_entry().await {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !include_hidden && file_name.starts_with('.') {
                continue;
            }

            let Ok(file_type) = entry.file_type().await else {
                continue;
            };

            if file_type.is_symlink() {
                continue;
            }

            let path = entry.path();
            let rel_path = path
                .strip_prefix(&root)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();

            if file_type.is_dir() {
                subdirs.push((path, file_name, rel_path));
            } else if file_type.is_file() {
                let size = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
                total_bytes += size;
                file_count += 1;
                files.push(ScanNode {
                    name: file_name,
                    rel_path,
                    size_bytes: size,
                    is_dir: false,
                    file_count: 0,
                    dir_count: 0,
                    children: Vec::new(),
                });
            }
        }

        dir_count += subdirs.len() as u64;

        let mut dir_nodes = Vec::new();
        if current_depth < 3 && subdirs.len() > 1 {
            let mut join_set = tokio::task::JoinSet::new();
            for (path, _, _) in subdirs {
                let s = sem.clone();
                let r = root.clone();
                join_set.spawn(async move {
                    scan_dir(path, r, s, include_hidden, current_depth + 1).await
                });
            }
            while let Some(res) = join_set.join_next().await {
                if let Ok(Ok(node)) = res {
                    total_bytes += node.size_bytes;
                    file_count += node.file_count;
                    dir_count += node.dir_count;
                    dir_nodes.push(node);
                }
            }
        } else {
            for (path, _, _) in subdirs {
                if let Ok(node) = scan_dir(path, root.clone(), sem.clone(), include_hidden, current_depth + 1).await {
                    total_bytes += node.size_bytes;
                    file_count += node.file_count;
                    dir_count += node.dir_count;
                    dir_nodes.push(node);
                }
            }
        }

        dir_nodes.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
        files.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
        if files.len() > 30 {
            files.truncate(30);
        }

        let mut children = dir_nodes;
        children.extend(files);

        let name = dir
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".into());
        let rel_path = dir
            .strip_prefix(&root)
            .unwrap_or(&dir)
            .to_string_lossy()
            .to_string();

        Ok(ScanNode {
            name,
            rel_path,
            size_bytes: total_bytes,
            is_dir: true,
            file_count,
            dir_count,
            children,
        })
    })
}

fn collect_flat<'a>(
    node: &'a ScanNode,
    all_files: &mut Vec<&'a ScanNode>,
    all_dirs: &mut Vec<&'a ScanNode>,
) {
    for child in &node.children {
        if child.is_dir {
            all_dirs.push(child);
            collect_flat(child, all_files, all_dirs);
        } else {
            all_files.push(child);
        }
    }
}

fn prune_to_depth(node: ScanNode, depth: usize, max_depth: usize) -> FolderSizeEntry {
    let children = if depth < max_depth && !node.children.is_empty() {
        const MAX_PER_FOLDER: usize = 35;
        let takes: Vec<ScanNode> = if node.children.len() > MAX_PER_FOLDER {
            node.children.into_iter().take(MAX_PER_FOLDER).collect()
        } else {
            node.children
        };
        Some(
            takes
                .into_iter()
                .map(|child| prune_to_depth(child, depth + 1, max_depth))
                .collect(),
        )
    } else {
        None
    };

    FolderSizeEntry {
        name: node.name,
        path: node.rel_path,
        size_bytes: node.size_bytes,
        is_dir: node.is_dir,
        file_count: node.file_count,
        dir_count: node.dir_count,
        children,
    }
}
