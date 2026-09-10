pub mod catalog;
pub mod catalog_cargo;
pub mod catalog_nx;
pub mod command;
pub mod documents;
pub mod git;
pub mod github;
pub mod github_auth;
pub mod paths;
pub mod service;
pub mod service_agents;
pub mod service_context;
pub mod service_work;
pub mod storage;
pub mod storage_work;
pub mod transport;

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
