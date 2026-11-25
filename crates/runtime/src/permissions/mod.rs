pub mod evaluator;
pub mod storage;
pub mod types;

use crate::{error, Result};
use evaluator::PermissionEvaluator;
use lilia_db::Database;
use std::sync::Arc;
use storage::PermissionStore;
use worklens_core::{
    GrantStatus, PermissionAuditEntry, PermissionCheckResult, PermissionGrant, PermissionType,
};

#[derive(Clone)]
pub struct PermissionManager {
    store: PermissionStore,
    evaluator: PermissionEvaluator,
}

impl PermissionManager {
    pub fn open(path: &std::path::Path) -> Result<Self> {
        let store = PermissionStore::open(path)?;
        let evaluator = PermissionEvaluator::new(store.clone());
        Ok(Self { store, evaluator })
    }

    pub fn new(db: Arc<Database>) -> Self {
        let store = PermissionStore::new(db);
        let evaluator = PermissionEvaluator::new(store.clone());
        Self { store, evaluator }
    }

    pub fn check(
        &self,
        plugin_id: &str,
        permission: &PermissionType,
        repo_trusted: bool,
    ) -> Result<PermissionCheckResult> {
        self.evaluator.check(plugin_id, permission, repo_trusted)
    }

    pub fn check_exec(
        &self,
        plugin_id: &str,
        binary: &str,
        args: &[String],
        allow_mutation: bool,
        repo_trusted: bool,
    ) -> Result<()> {
        let requested = PermissionType::ExecCommand {
            binary: binary.to_string(),
            allowed_args_patterns: args.to_vec(),
            allow_mutation,
        };
        let res = self.evaluator.check(plugin_id, &requested, repo_trusted)?;
        if !res.allowed {
            return Err(error(format!(
                "Permission denied for '{binary}': {}",
                res.reason
            )));
        }
        Ok(())
    }

    pub fn check_fs_read(&self, plugin_id: &str, path: &str) -> Result<()> {
        let requested = PermissionType::FsRead {
            paths: vec![path.to_string()],
        };
        let res = self.evaluator.check(plugin_id, &requested, true)?;
        if !res.allowed {
            return Err(error(format!(
                "Filesystem read denied for '{path}': {}",
                res.reason
            )));
        }
        Ok(())
    }

    pub fn check_fs_write(&self, plugin_id: &str, path: &str, repo_trusted: bool) -> Result<()> {
        if !repo_trusted {
            return Err(error("Repository trust required for filesystem write"));
        }
        let requested = PermissionType::FsWrite {
            paths: vec![path.to_string()],
        };
        let res = self.evaluator.check(plugin_id, &requested, repo_trusted)?;
        if !res.allowed {
            return Err(error(format!(
                "Filesystem write denied for '{path}': {}",
                res.reason
            )));
        }
        Ok(())
    }

    pub fn grant(
        &self,
        plugin_id: &str,
        permission_id: &str,
        permission: PermissionType,
    ) -> Result<()> {
        let grant = PermissionGrant {
            plugin_id: plugin_id.to_string(),
            permission_id: permission_id.to_string(),
            permission,
            status: GrantStatus::Granted,
            granted_at: Some(worklens_core::now()),
            expires_at: None,
        };
        self.store.set_grant(&grant)
    }

    pub fn revoke(&self, plugin_id: &str, permission_id: &str) -> Result<bool> {
        self.store.revoke_grant(plugin_id, permission_id)
    }

    pub fn list_grants(&self, plugin_id: Option<&str>) -> Result<Vec<PermissionGrant>> {
        self.store.list_grants(plugin_id)
    }

    pub fn list_audit_logs(
        &self,
        limit: u32,
        plugin_id: Option<&str>,
    ) -> Result<Vec<PermissionAuditEntry>> {
        self.store.list_audit_logs(limit, plugin_id)
    }
}
