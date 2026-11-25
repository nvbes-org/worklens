use crate::{error, Result};
use lilia_core::BatchOperation;
use lilia_db::{Database, Options, Scan};
use std::sync::Arc;
use worklens_core::{GrantStatus, PermissionAuditEntry, PermissionGrant};

#[derive(Clone)]
pub struct PermissionStore {
    db: Arc<Database>,
}

impl PermissionStore {
    pub fn open(path: &std::path::Path) -> Result<Self> {
        let db = Database::open(path, Options::default())
            .map_err(|e| error(format!("Failed to open LiliaDB: {e}")))?;
        Ok(Self { db: Arc::new(db) })
    }

    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn list_grants(&self, plugin_id: Option<&str>) -> Result<Vec<PermissionGrant>> {
        let session = self.db.system();
        let entries = if let Some(pid) = plugin_id {
            let prefix = format!("{pid}:");
            session
                .json_scan(
                    "plugin_grants",
                    &Scan::all().prefix(prefix.as_bytes()).limit(1000),
                )
                .map_err(|e| error(format!("LiliaDB error: {e}")))?
        } else {
            session
                .json_scan("plugin_grants", &Scan::all().limit(1000))
                .map_err(|e| error(format!("LiliaDB error: {e}")))?
        };

        let mut grants = Vec::new();
        for r in entries {
            if let Ok(grant) = serde_json::from_value::<PermissionGrant>(r.value()) {
                grants.push(grant);
            }
        }
        grants.sort_by(|a, b| a.permission_id.cmp(&b.permission_id));
        Ok(grants)
    }

    pub fn set_grant(&self, grant: &PermissionGrant) -> Result<()> {
        let id = format!("{}:{}", grant.plugin_id, grant.permission_id);
        let op = BatchOperation::JsonPut {
            space: "plugin_grants".into(),
            id,
            value: serde_json::to_value(grant)?,
            if_version: None,
        };
        crate::storage::db_batch(&self.db, &[op])?;
        Ok(())
    }

    pub fn revoke_grant(&self, plugin_id: &str, permission_id: &str) -> Result<bool> {
        let id = format!("{plugin_id}:{permission_id}");
        let session = self.db.system();
        if let Some(entry) = session
            .json_get("plugin_grants", &id)
            .map_err(|e| error(format!("LiliaDB error: {e}")))?
        {
            let mut grant: PermissionGrant = serde_json::from_value(entry.value())?;
            grant.status = GrantStatus::Revoked;
            let op = BatchOperation::JsonPut {
                space: "plugin_grants".into(),
                id,
                value: serde_json::to_value(&grant)?,
                if_version: None,
            };
            crate::storage::db_batch(&self.db, &[op])?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn record_audit(&self, entry: &PermissionAuditEntry) -> Result<()> {
        let key = format!("{}:{}:{}", entry.timestamp, entry.plugin_id, entry.id);
        let op = BatchOperation::JsonPut {
            space: "permission_audit_logs".into(),
            id: key,
            value: serde_json::to_value(entry)?,
            if_version: None,
        };
        crate::storage::db_batch(&self.db, &[op])?;
        Ok(())
    }

    pub fn list_audit_logs(
        &self,
        limit: u32,
        plugin_id: Option<&str>,
    ) -> Result<Vec<PermissionAuditEntry>> {
        let session = self.db.system();
        let entries = session
            .json_scan("permission_audit_logs", &Scan::all().limit(1000))
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        let mut logs = Vec::new();
        for r in entries {
            if let Ok(entry) = serde_json::from_value::<PermissionAuditEntry>(r.value()) {
                if let Some(pid) = plugin_id {
                    if entry.plugin_id != pid {
                        continue;
                    }
                }
                logs.push(entry);
            }
        }
        logs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        logs.truncate(limit as usize);
        Ok(logs)
    }
}
