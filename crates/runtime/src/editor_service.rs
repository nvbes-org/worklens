use crate::{Result, command::git, error, paths};
use std::path::Path;
use worklens_core::FilePayload;

const MAX_FILE_SIZE: u64 = 1_048_576; // 1 MB limit for in-app editor

pub async fn file_read(root: &Path, relative: &str) -> Result<FilePayload> {
    let path = paths::confined(root, relative)?;
    if !path.exists() {
        return Err(error(format!("File does not exist: {relative}")));
    }
    if path.is_dir() {
        return Err(error(format!("Path is a directory: {relative}")));
    }
    let metadata = std::fs::metadata(&path)?;
    let size_bytes = metadata.len();
    if size_bytes > MAX_FILE_SIZE {
        return Err(error(format!(
            "File exceeds in-app editor size limit (1MB): {size_bytes} bytes"
        )));
    }
    let content = paths::read_bounded(&path, MAX_FILE_SIZE)?;
    let readonly = metadata.permissions().readonly();

    Ok(FilePayload {
        path: relative.to_string(),
        content,
        size_bytes,
        readonly,
    })
}

pub async fn file_write(root: &Path, relative: &str, content: &str) -> Result<()> {
    let path = paths::confined(root, relative)?;
    if content.len() as u64 > MAX_FILE_SIZE * 2 {
        return Err(error("Content exceeds write limit (2MB)"));
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(&path, content)?;
    Ok(())
}

pub async fn file_list(root: &Path) -> Result<Vec<String>> {
    let output = git(root, &["ls-files", "-co", "--exclude-standard"]).await?;
    let files = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(10_000)
        .map(str::to_string)
        .collect();
    Ok(files)
}
