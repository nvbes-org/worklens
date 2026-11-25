use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub source: String,
    pub collected_at: String,
    pub status: Availability,
    pub detail: Option<String>,
    pub revision: Option<String>,
}

impl Provenance {
    pub fn observed(source: &str) -> Self {
        Self {
            source: source.into(),
            collected_at: crate::now(),
            status: Availability::Available,
            detail: None,
            revision: None,
        }
    }
    pub fn unavailable(source: &str, detail: &str) -> Self {
        Self {
            status: Availability::Unavailable,
            detail: Some(detail.into()),
            ..Self::observed(source)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(rename_all = "snake_case")]
pub enum Availability {
    Available,
    Partial,
    Stale,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub path: String,
    pub common_dir: String,
    pub trusted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub previous_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub id: String,
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub locked: bool,
    pub prunable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub head: String,
    pub upstream: Option<String>,
    pub tracking: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Remote {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub name: String,
    pub commit: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    pub sha: String,
    pub selector: String,
    pub action: String,
    pub date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub author_email: String,
    pub date: String,
    pub subject: String,
    pub body: String,
    #[serde(default)]
    pub signature_status: Option<String>,
    #[serde(default)]
    pub signer: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub index: u32,
    pub selector: String,
    pub sha: String,
    pub message: String,
    pub date: String,
    pub author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RebaseItem {
    pub sha: String,
    pub action: String,
    pub author: String,
    pub date: String,
    pub subject: String,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RebaseStatus {
    pub in_progress: bool,
    pub current_commit: Option<String>,
    pub onto: Option<String>,
    pub branch: Option<String>,
    pub step: Option<u32>,
    pub total: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LfsFile {
    pub path: String,
    pub oid: String,
    pub size_bytes: u64,
    pub formatted_size: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LfsLock {
    pub id: String,
    pub path: String,
    pub owner: String,
    pub locked_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LfsStatus {
    pub installed: bool,
    pub version: String,
    pub patterns: Vec<String>,
    pub files: Vec<LfsFile>,
    pub locks: Vec<LfsLock>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct LargeFileCandidate {
    pub path: String,
    pub size_bytes: u64,
    pub formatted_size: String,
    pub is_lfs_tracked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SubmoduleEntry {
    pub name: String,
    pub path: String,
    pub url: String,
    pub commit: String,
    pub branch: Option<String>,
    pub status: String,
    pub initialized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SigningStatus {
    pub gpg_sign: bool,
    pub format: String,
    pub signing_key: Option<String>,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
    pub gpg_available: bool,
    pub ssh_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SshKeyInfo {
    pub name: String,
    pub path: String,
    pub public_key: String,
    pub fingerprint: String,
    pub key_type: String,
    pub in_agent: bool,
    pub is_signing_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitSnapshot {
    pub repository: Repository,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub changes: Vec<FileChange>,
    pub branches: Vec<Branch>,
    pub remotes: Vec<Remote>,
    pub tags: Vec<Tag>,
    pub worktrees: Vec<Worktree>,
    pub commits: Vec<Commit>,
    pub next_offset: Option<u32>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct DiffResult {
    pub text: String,
    pub truncated: bool,
    pub binary: bool,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Document {
    pub path: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ToolStatus {
    pub tool: String,
    pub available: bool,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum FileChangeKind {
    Created,
    Modified,
    Deleted,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    pub path: String,
    pub relative_path: String,
    pub kind: FileChangeKind,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FilePayload {
    pub path: String,
    pub content: String,
    pub size_bytes: u64,
    pub readonly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConflictHunk {
    pub id: String,
    pub current_name: String,
    pub current_content: String,
    pub incoming_name: String,
    pub incoming_content: String,
    pub base_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFileDetails {
    pub path: String,
    pub full_content: String,
    pub hunks: Vec<ConflictHunk>,
    pub base_version: Option<String>,
    pub current_version: Option<String>,
    pub incoming_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConflictItem {
    pub path: String,
    pub status: String,
    pub conflict_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MultiRepoWorkspace {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub repos: Vec<WorkspaceRepoEntry>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRepoEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub remote_url: Option<String>,
    pub default_branch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RepoGitStatus {
    pub repo_id: String,
    pub name: String,
    pub path: String,
    pub exists: bool,
    pub current_branch: Option<String>,
    pub tracking_branch: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub is_dirty: bool,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
    pub conflicted_count: usize,
    pub last_commit_sha: Option<String>,
    pub last_commit_message: Option<String>,
    pub last_commit_author: Option<String>,
    pub last_commit_timestamp: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MultiRepoStatus {
    pub workspace_id: String,
    pub repos: Vec<RepoGitStatus>,
    pub total_repos: usize,
    pub clean_repos: usize,
    pub dirty_repos: usize,
    pub ahead_repos: usize,
    pub behind_repos: usize,
    pub missing_repos: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BatchOperationResult {
    pub operation: String,
    pub repo_id: String,
    pub repo_name: String,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct BatchReport {
    pub operation: String,
    pub total: usize,
    pub succeeded: usize,
    pub failed: usize,
    pub results: Vec<BatchOperationResult>,
}

