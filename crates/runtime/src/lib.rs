pub mod catalog;
pub mod catalog_cargo;
pub mod catalog_nx;
pub mod catalog_pnpm;
pub mod catalog_vendors;
mod catalog_workspace;
pub mod cloud_arch;
pub mod cloud_cicd;
pub mod cloud_hcl;
pub mod cloud_scanner;
pub mod scaleway_auth;
pub mod scaleway_client;
pub mod service_cloud;
pub mod command;
pub mod component_metadata;
mod context_snapshot;
pub mod documents;
pub mod editor_service;
pub mod engines;
pub mod folder_sizes;
pub mod git;
pub mod git_actions;
pub mod git_commands;
pub mod merge_service;
pub mod git_lfs;
pub mod git_rebase;
pub mod git_signing;
pub mod git_stash;
pub mod git_submodules;
pub mod git_worktree;
pub mod github;
pub mod github_auth;
pub mod github_impact;
pub mod boundaries;
pub mod github_checks;
pub mod github_dispatch;
pub mod github_comment;
pub mod multi_repo;
pub mod multi_repo_batch;
mod metadata_integrity;
pub mod paths;
pub mod plugins;
pub mod process_autokill;
pub mod process_debug;
pub mod process_env;
pub mod process_journal;
pub mod process_manager;
pub mod process_scanner;
pub mod process_sysinfo;
pub mod service;
pub mod service_agents;
pub mod service_config;
pub mod service_context;
pub mod service_github_ext;
pub mod service_impact;
pub mod service_permissions;
pub mod service_plugins;
pub mod service_process;
pub mod service_work;
pub mod storage;
pub mod storage_profiles;
pub mod permissions;
pub mod storage_work;
pub mod transport;
pub mod transport_http;
pub mod transport_mcp;
pub mod transport_manager;
pub mod watcher;
mod work_context;
mod work_context_evidence;
mod work_context_sources;
mod work_decisions;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Message(String),
    #[error("{0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Network request failed: {0}")]
    Http(#[from] reqwest::Error),
}
pub type Result<T> = std::result::Result<T, Error>;
pub fn error(message: impl Into<String>) -> Error {
    Error::Message(message.into())
}
mod github_validations;
mod service_validations;
