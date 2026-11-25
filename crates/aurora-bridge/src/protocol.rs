use aurora_blocks::CommandBlock;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BridgeRequest {
    Spawn {
        shell: Option<String>,
        cwd: Option<String>,
        rows: u16,
        cols: u16,
    },
    Write {
        session_id: String,
        data: Vec<u8>,
    },
    Resize {
        session_id: String,
        rows: u16,
        cols: u16,
    },
    Kill {
        session_id: String,
    },
    List,
    GetBlocks {
        session_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BridgeResponse {
    Spawned { session_id: String },
    Output { session_id: String, data: Vec<u8> },
    Sessions(Vec<String>),
    Blocks(Vec<CommandBlock>),
    Ok,
    Error(String),
}
