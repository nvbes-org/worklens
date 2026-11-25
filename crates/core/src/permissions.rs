use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PermissionType {
    ExecCommand {
        binary: String,
        #[serde(default, alias = "allowedArgsPatterns")]
        allowed_args_patterns: Vec<String>,
        #[serde(default, alias = "allowMutation")]
        allow_mutation: bool,
    },
    FsRead {
        #[serde(default)]
        paths: Vec<String>,
    },
    FsWrite {
        #[serde(default)]
        paths: Vec<String>,
    },
    NetworkAccess {
        #[serde(default)]
        domains: Vec<String>,
        #[serde(default)]
        ports: Vec<u16>,
    },
    Environment {
        #[serde(default, alias = "allowedVars")]
        allowed_vars: Vec<String>,
        #[serde(default, alias = "blockedVars")]
        blocked_vars: Vec<String>,
    },
    WorklensScope {
        #[serde(default)]
        operations: Vec<String>,
    },
    ProcessControl {
        #[serde(default, alias = "canSpawn")]
        can_spawn: bool,
        #[serde(default, alias = "canKill")]
        can_kill: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "snake_case")]
pub enum GrantStatus {
    Granted,
    Denied,
    PromptRequired,
    Revoked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct PermissionGrant {
    pub plugin_id: String,
    pub permission_id: String,
    pub permission: PermissionType,
    pub status: GrantStatus,
    pub granted_at: Option<String>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct PermissionAuditEntry {
    pub id: String,
    pub plugin_id: String,
    pub action: String,
    pub resource: String,
    pub decision: String,
    pub reason: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct PermissionCheckRequest {
    pub plugin_id: String,
    pub permission: PermissionType,
    pub repository_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[serde(rename_all = "camelCase")]
pub struct PermissionCheckResult {
    pub allowed: bool,
    pub reason: String,
}
