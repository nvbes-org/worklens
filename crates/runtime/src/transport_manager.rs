use crate::{
    error,
    service::Service,
    transport_http::{start_http_server, HttpServerHandle},
    transport_mcp::McpTransportManager,
    Result,
};
use std::sync::Arc;
use tokio::sync::Mutex;
use worklens_core::{now, ConfigProfile, SingleTransportStatus, TransportStatusReport};

pub struct TransportManager {
    http_handle: Arc<Mutex<Option<HttpServerHandle>>>,
    mcp_manager: Arc<McpTransportManager>,
    sock_running: Arc<std::sync::Mutex<bool>>,
    service_ref: Arc<std::sync::Mutex<Option<std::sync::Weak<Service>>>>,
}

impl Default for TransportManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TransportManager {
    pub fn new() -> Self {
        Self {
            http_handle: Arc::new(Mutex::new(None)),
            mcp_manager: Arc::new(McpTransportManager::new()),
            sock_running: Arc::new(std::sync::Mutex::new(true)),
            service_ref: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    pub fn set_service(&self, service: std::sync::Weak<Service>) {
        if let Ok(mut lock) = self.service_ref.lock() {
            *lock = Some(service);
        }
    }

    pub fn set_sock_running(&self, running: bool) {
        if let Ok(mut lock) = self.sock_running.lock() {
            *lock = running;
        }
    }

    pub async fn status(&self, profile: &ConfigProfile) -> TransportStatusReport {
        let http_lock = self.http_handle.lock().await;
        let sock_is_running = *self.sock_running.lock().unwrap();
        let mcp_is_running = self.mcp_manager.is_running().await;

        let sock_status = SingleTransportStatus {
            name: "sock".into(),
            enabled: profile.transports.sock_enabled,
            running: sock_is_running,
            endpoint: Some("service.sock".into()),
            error: None,
        };

        let pipe_status = SingleTransportStatus {
            name: "pipe".into(),
            enabled: profile.transports.pipe_enabled,
            running: sock_is_running,
            endpoint: Some("named_pipe/worklens".into()),
            error: None,
        };

        let (api_running, api_endpoint) = if let Some(ref h) = *http_lock {
            (true, Some(format!("http://{}", h.addr)))
        } else {
            (false, None)
        };

        let api_status = SingleTransportStatus {
            name: "api".into(),
            enabled: profile.transports.api_enabled,
            running: api_running,
            endpoint: api_endpoint,
            error: None,
        };

        let mcp_kind = self.mcp_manager.kind().await;
        let mcp_status = SingleTransportStatus {
            name: "mcp".into(),
            enabled: profile.transports.mcp_enabled,
            running: mcp_is_running,
            endpoint: Some(format!("{:?}", mcp_kind)),
            error: None,
        };

        TransportStatusReport {
            active_profile_id: profile.id.clone(),
            transports: vec![sock_status, pipe_status, api_status, mcp_status],
            reported_at: now(),
        }
    }

    pub async fn reconfigure(&self, profile: &ConfigProfile) -> Result<()> {
        // 1. Configure MCP
        self.mcp_manager.configure(profile).await?;

        // 2. Configure HTTP API server
        let mut http_lock = self.http_handle.lock().await;
        if profile.transports.api_enabled {
            if let Some(existing) = http_lock.take() {
                existing.stop();
            }
            let maybe_service = self
                .service_ref
                .lock()
                .unwrap()
                .as_ref()
                .and_then(|w| w.upgrade());
            if let Some(service) = maybe_service {
                match start_http_server(profile, service).await {
                    Ok(handle) => {
                        *http_lock = Some(handle);
                    }
                    Err(e) => {
                        return Err(error(format!("Failed to start HTTP API transport: {e}")));
                    }
                }
            }
        } else if let Some(existing) = http_lock.take() {
            existing.stop();
        }

        Ok(())
    }

    pub async fn enable_transport(&self, name: &str, profile: &ConfigProfile) -> Result<()> {
        match name {
            "api" => {
                let mut http_lock = self.http_handle.lock().await;
                if http_lock.is_some() {
                    return Ok(());
                }
                let maybe_service = self
                    .service_ref
                    .lock()
                    .unwrap()
                    .as_ref()
                    .and_then(|w| w.upgrade());
                if let Some(service) = maybe_service {
                    let handle = start_http_server(profile, service).await?;
                    *http_lock = Some(handle);
                }
                Ok(())
            }
            "mcp" => {
                let mut p = profile.clone();
                p.transports.mcp_enabled = true;
                self.mcp_manager.configure(&p).await
            }
            "sock" | "pipe" => {
                *self.sock_running.lock().unwrap() = true;
                Ok(())
            }
            _ => Err(error(format!("Unknown transport: {name}"))),
        }
    }

    pub async fn disable_transport(&self, name: &str) -> Result<()> {
        match name {
            "api" => {
                let mut http_lock = self.http_handle.lock().await;
                if let Some(h) = http_lock.take() {
                    h.stop();
                }
                Ok(())
            }
            "mcp" => {
                let mut p = ConfigProfile::default_local();
                p.transports.mcp_enabled = false;
                self.mcp_manager.configure(&p).await
            }
            "sock" | "pipe" => {
                *self.sock_running.lock().unwrap() = false;
                Ok(())
            }
            _ => Err(error(format!("Unknown transport: {name}"))),
        }
    }
}
