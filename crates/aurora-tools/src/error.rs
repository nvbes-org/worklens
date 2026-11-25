use thiserror::Error;

#[derive(Error, Debug)]
pub enum AuroraError {
    #[error("Keychain operation failed: {0}")]
    Keychain(String),

    #[error("Regex error: {0}")]
    Regex(#[from] regex::Error),
}

pub type Result<T> = std::result::Result<T, AuroraError>;
