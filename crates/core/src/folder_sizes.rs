use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct FolderSizeEntry {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub is_dir: bool,
    pub file_count: u64,
    pub dir_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FolderSizeEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct FolderSizeReport {
    pub root_path: String,
    pub total_bytes: u64,
    pub total_files: u64,
    pub total_dirs: u64,
    pub duration_ms: u64,
    pub tree: FolderSizeEntry,
    pub top_largest_files: Vec<FolderSizeEntry>,
    pub top_largest_dirs: Vec<FolderSizeEntry>,
}
