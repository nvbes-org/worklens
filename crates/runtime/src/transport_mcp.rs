use crate::Result;
use std::sync::Arc;
use worklens_core::{ConfigProfile, McpTransportKind};

pub struct McpTransportHandle {
    pub kind: McpTransportKind,
    pub running: bool,
}

pub struct McpTransportManager {
    handle: Arc<tokio::sync::Mutex<Option<McpTransportHandle>>>,
}

impl Default for McpTransportManager {
    fn default() -> Self {
        Self::new()
    }
}

impl McpTransportManager {
    pub fn new() -> Self {
        Self {
            handle: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    pub async fn configure(&self, profile: &ConfigProfile) -> Result<()> {
        let mut lock = self.handle.lock().await;
        if profile.transports.mcp_enabled {
            *lock = Some(McpTransportHandle {
                kind: profile.transports.mcp_transport.clone(),
                running: true,
            });
        } else {
            *lock = None;
        }
        Ok(())
    }

    pub async fn is_running(&self) -> bool {
        self.handle
            .lock()
            .await
            .as_ref()
            .map(|h| h.running)
            .unwrap_or(false)
    }

    pub async fn kind(&self) -> McpTransportKind {
        self.handle
            .lock()
            .await
            .as_ref()
            .map(|h| h.kind.clone())
            .unwrap_or(McpTransportKind::Stdio)
    }
}
