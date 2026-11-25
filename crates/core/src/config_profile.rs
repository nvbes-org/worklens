use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum TlsMode {
    Disabled,
    Optional,
    Required,
    MutualTls,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct TlsConfig {
    pub mode: TlsMode,
    pub client_cert_path: Option<String>,
    pub client_key_path: Option<String>,
    pub ca_cert_path: Option<String>,
    #[serde(default)]
    pub pinned_fingerprints: Vec<String>,
    pub min_version: String,
}

impl Default for TlsConfig {
    fn default() -> Self {
        Self {
            mode: TlsMode::Disabled,
            client_cert_path: None,
            client_key_path: None,
            ca_cert_path: None,
            pinned_fingerprints: Vec::new(),
            min_version: "1.3".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    pub enabled: bool,
    pub url: Option<String>,
    pub auth_keychain_key: Option<String>,
    #[serde(default)]
    pub no_proxy: Vec<String>,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            url: None,
            auth_keychain_key: None,
            no_proxy: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum VpnMode {
    None,
    WireGuard,
    Tailscale,
    CustomTunnel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct VpnConfig {
    pub enabled: bool,
    pub mode: VpnMode,
    pub endpoint: Option<String>,
    pub interface: Option<String>,
    #[serde(default)]
    pub routed_subnets: Vec<String>,
    pub auth_keychain_key: Option<String>,
}

impl Default for VpnConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            mode: VpnMode::None,
            endpoint: None,
            interface: None,
            routed_subnets: Vec::new(),
            auth_keychain_key: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct NetworkConfig {
    pub proxy: ProxyConfig,
    pub tls: TlsConfig,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub vpn: VpnConfig,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            proxy: ProxyConfig::default(),
            tls: TlsConfig::default(),
            headers: HashMap::new(),
            vpn: VpnConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum McpTransportKind {
    Stdio,
    SseHttp,
    Socket,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct TransportToggles {
    pub sock_enabled: bool,
    pub pipe_enabled: bool,
    pub api_enabled: bool,
    pub api_port: u16,
    pub api_bind: String,
    pub mcp_enabled: bool,
    pub mcp_transport: McpTransportKind,
}

impl Default for TransportToggles {
    fn default() -> Self {
        Self {
            sock_enabled: true,
            pipe_enabled: true,
            api_enabled: false,
            api_port: 4040,
            api_bind: "127.0.0.1".into(),
            mcp_enabled: true,
            mcp_transport: McpTransportKind::Stdio,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConfigProfile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub network: NetworkConfig,
    pub transports: TransportToggles,
    pub created_at: String,
    pub updated_at: String,
}

impl ConfigProfile {
    pub fn default_local() -> Self {
        let now = crate::now();
        Self {
            id: "profile_default".into(),
            name: "Default Local".into(),
            description: Some("Default local Unix domain socket & stdio configuration".into()),
            is_active: true,
            network: NetworkConfig::default(),
            transports: TransportToggles::default(),
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct SingleTransportStatus {
    pub name: String,
    pub enabled: bool,
    pub running: bool,
    pub endpoint: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct TransportStatusReport {
    pub active_profile_id: String,
    pub transports: Vec<SingleTransportStatus>,
    pub reported_at: String,
}
