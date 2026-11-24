use crate::{error, Result};
use lilia_core::{BatchOperation, IndexOptions, MutationResult};
use lilia_db::{Database, Options, Scan};
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;
use worklens_core::{AgentSession, MultiRepoWorkspace, Repository};

pub fn db_batch(db: &Database, ops: &[BatchOperation]) -> Result<Vec<MutationResult>> {
    let batch = lilia_db::wire::batch(ops).map_err(|e| error(format!("LiliaDB error: {e}")))?;
    let outcomes = db.system().commit(&batch).map_err(|e| match e {
        lilia_db::Error::Conflict { .. } => {
            error("Revision conflict: reload the work item before applying your change")
        }
        _ => error(format!("LiliaDB error: {e}")),
    })?;
    Ok(lilia_db::wire::results(&outcomes))
}

pub struct Store {
    pub(crate) db: Arc<Database>,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Database::open(path, Options::default())
            .map_err(|e| error(format!("Failed to open LiliaDB: {e}")))?;

        // Ensure indexes
        let _ = db.create_index("agents", "by_repo", "$.repositoryId", &IndexOptions::default());
        let _ = db.create_index("work_items", "by_repo", "$.repositoryId", &IndexOptions::default());
        let _ = db.create_index("work_items", "by_state", "$.state", &IndexOptions::default());

        let store = Self { db: Arc::new(db) };
        let _ = store.ensure_default_profile();
        Ok(store)
    }

    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    pub fn batch(&self, ops: &[BatchOperation]) -> Result<Vec<MutationResult>> {
        db_batch(&self.db, ops)
    }

    pub fn remember(&self, repo: &Repository) -> Result<()> {
        let id = worklens_core::stable_id("repo", &repo.path);
        let val = serde_json::json!({
            "repo": repo,
            "opened_at": worklens_core::now(),
        });
        let op = BatchOperation::JsonPut {
            space: "repositories".into(),
            id,
            value: val,
            if_version: None,
        };
        self.batch(&[op])?;
        Ok(())
    }

    pub fn recent(&self) -> Result<Vec<Repository>> {
        let session = self.db.system();
        let entries = session
            .json_scan("repositories", &Scan::all().limit(100))
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        let mut list = Vec::new();
        for e in entries {
            let val = e.value();
            if let Ok(repo) = serde_json::from_value::<Repository>(val["repo"].clone()) {
                let opened_at = val["opened_at"].as_str().unwrap_or("").to_string();
                list.push((opened_at, repo));
            }
        }
        list.sort_by(|a, b| b.0.cmp(&a.0));
        list.truncate(20);
        Ok(list.into_iter().map(|(_, r)| r).collect())
    }

    pub fn registered(&self, path: &str) -> Result<bool> {
        let id = worklens_core::stable_id("repo", path);
        let session = self.db.system();
        let entry = session
            .json_get("repositories", &id)
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        Ok(entry.is_some())
    }

    pub fn setting(&self, key: &str) -> Result<Option<String>> {
        let session = self.db.system();
        let entry = session
            .kv_get("settings", key.as_bytes())
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        Ok(entry.and_then(|e| String::from_utf8(e.value).ok()))
    }

    pub fn set(&self, key: &str, value: &str) -> Result<()> {
        let op = BatchOperation::KvSet {
            namespace: "settings".into(),
            key: key.as_bytes().to_vec(),
            value: value.as_bytes().to_vec(),
            if_version: None,
            expires_at_ms: None,
        };
        self.batch(&[op])?;
        Ok(())
    }

    pub fn cache(&self, key: &str) -> Result<Option<Value>> {
        let session = self.db.system();
        let entry = session
            .kv_get("cache", key.as_bytes())
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        match entry {
            Some(e) => Ok(Some(serde_json::from_slice(&e.value)?)),
            None => Ok(None),
        }
    }

    pub fn put_cache(&self, key: &str, value: &Value) -> Result<()> {
        let bytes = serde_json::to_vec(value)?;
        let expires_at_ms = Some(chrono::Utc::now().timestamp_millis() + 3_600_000);
        let op = BatchOperation::KvSet {
            namespace: "cache".into(),
            key: key.as_bytes().to_vec(),
            value: bytes,
            if_version: None,
            expires_at_ms,
        };
        self.batch(&[op])?;
        Ok(())
    }

    pub fn agent(&self, id: &str) -> Result<Option<AgentSession>> {
        let session = self.db.system();
        let entry = session
            .json_get("agents", id)
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        match entry {
            Some(e) => Ok(Some(serde_json::from_value(e.value())?)),
            None => Ok(None),
        }
    }

    pub fn event_payload(&self, id: &str) -> Result<Option<String>> {
        let session = self.db.system();
        let entry = session
            .kv_get("events", id.as_bytes())
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        Ok(entry.and_then(|e| String::from_utf8(e.value).ok()))
    }

    pub fn agents(&self, repository_id: &str) -> Result<Vec<AgentSession>> {
        let session = self.db.system();
        let mut query = serde_json::Map::new();
        query.insert(
            "repositoryId".into(),
            serde_json::Value::String(repository_id.to_string()),
        );
        let entries = session
            .json_find("agents", &query, &Scan::all().limit(1000))
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        let mut sessions = Vec::new();
        for e in entries {
            let mut session: AgentSession = serde_json::from_value(e.value())?;
            session.presence = worklens_core::presence(&session.last_seen, chrono::Utc::now());
            sessions.push(session);
        }
        Ok(sessions)
    }

    pub fn event(&self, event_id: &str, payload: &Value, session: &AgentSession) -> Result<bool> {
        let db_session = self.db.system();
        let existing = db_session
            .kv_get("events", event_id.as_bytes())
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        let encoded_payload = payload.to_string();
        if let Some(entry) = existing {
            let original = String::from_utf8(entry.value).unwrap_or_default();
            if original != encoded_payload {
                return Err(error("Event ID reused with different content"));
            }
            return Ok(false);
        }
        let ops = vec![
            BatchOperation::KvSet {
                namespace: "events".into(),
                key: event_id.as_bytes().to_vec(),
                value: encoded_payload.into_bytes(),
                if_version: None,
                expires_at_ms: None,
            },
            BatchOperation::JsonPut {
                space: "agents".into(),
                id: session.id.clone(),
                value: serde_json::to_value(session)?,
                if_version: None,
            },
        ];
        self.batch(&ops)?;
        Ok(true)
    }

    pub fn list_multi_workspaces(&self) -> Result<Vec<MultiRepoWorkspace>> {
        let session = self.db.system();
        let entries = session
            .json_scan("multi_workspaces", &Scan::all().limit(100))
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        let mut list = Vec::new();
        for e in entries {
            list.push(serde_json::from_value(e.value())?);
        }
        list.sort_by(|a: &MultiRepoWorkspace, b: &MultiRepoWorkspace| {
            b.updated_at.cmp(&a.updated_at)
        });
        Ok(list)
    }

    pub fn get_multi_workspace(&self, id: &str) -> Result<Option<MultiRepoWorkspace>> {
        let session = self.db.system();
        let entry = session
            .json_get("multi_workspaces", id)
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        match entry {
            Some(e) => Ok(Some(serde_json::from_value(e.value())?)),
            None => Ok(None),
        }
    }

    pub fn save_multi_workspace(&self, ws: &MultiRepoWorkspace) -> Result<()> {
        let op = BatchOperation::JsonPut {
            space: "multi_workspaces".into(),
            id: ws.id.clone(),
            value: serde_json::to_value(ws)?,
            if_version: None,
        };
        self.batch(&[op])?;
        Ok(())
    }

    pub fn delete_multi_workspace(&self, id: &str) -> Result<bool> {
        let op = BatchOperation::JsonDelete {
            space: "multi_workspaces".into(),
            id: id.into(),
            if_version: None,
        };
        let res = self.batch(&[op])?;
        Ok(res.first().map_or(false, |r| r.deleted))
    }
}
