use thiserror::Error;

#[derive(Error, Debug)]
pub enum AuroraError {
    #[error("PTY allocation failed: {0}")]
    PtyAllocation(String),

    #[error("PTY I/O error: {0}")]
    PtyIo(#[from] std::io::Error),

    #[error("Process spawn failed for command '{0}': {1}")]
    ProcessSpawn(String, String),

    #[error("Invalid OSC sequence: {0}")]
    InvalidOsc(String),

    #[error("Base64 decode failed for clipboard: {0}")]
    Base64Decode(String),

    #[error("Invalid terminal dimension: {rows}x{cols}")]
    InvalidDimensions { rows: u16, cols: u16 },

    #[error("Protocol error: {0}")]
    Protocol(String),
}

pub type Result<T> = std::result::Result<T, AuroraError>;
