use crate::{Result, error};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;
use std::path::Path;
use worklens_core::{AgentSession, Repository};

pub struct Store {
    pub(crate) connection: Connection,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path)?;
        let version: u32 = connection.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 4 {
            return Err(error("Database is newer than this Worklens build"));
        }
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS repositories (path TEXT PRIMARY KEY, value TEXT NOT NULL, opened_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, collected_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, repository_id TEXT NOT NULL, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
            ")?;
        connection.execute_batch("BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS work_items (repository_id TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(repository_id,id));
            CREATE TABLE IF NOT EXISTS work_events (repository_id TEXT NOT NULL, event_id TEXT NOT NULL, work_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(repository_id,event_id), UNIQUE(repository_id,work_id,revision));
            PRAGMA user_version=4;
            COMMIT;")?;
        Ok(Self { connection })
    }

    pub fn remember(&self, repo: &Repository) -> Result<()> {
        self.connection.execute("INSERT INTO repositories VALUES (?1, ?2, ?3) ON CONFLICT(path) DO UPDATE SET value=excluded.value, opened_at=excluded.opened_at", params![repo.path, serde_json::to_string(repo)?, worklens_core::now()])?;
        Ok(())
    }

    pub fn recent(&self) -> Result<Vec<Repository>> {
        let mut stmt = self
            .connection
            .prepare("SELECT value FROM repositories ORDER BY opened_at DESC LIMIT 20")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.map(|row| Ok(serde_json::from_str(&row?)?)).collect()
    }

    pub fn registered(&self, path: &str) -> Result<bool> {
        Ok(self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM repositories WHERE path=?)",
            [path],
            |row| row.get(0),
        )?)
    }

    pub fn setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .connection
            .query_row("SELECT value FROM settings WHERE key=?", [key], |row| {
                row.get(0)
            })
            .optional()?)
    }

    pub fn set(&self, key: &str, value: &str) -> Result<()> {
        self.connection.execute("INSERT INTO settings VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [key, value])?;
        Ok(())
    }

    pub fn cache(&self, key: &str) -> Result<Option<Value>> {
        let text: Option<String> = self
            .connection
            .query_row("SELECT value FROM cache WHERE key=?", [key], |row| {
                row.get(0)
            })
            .optional()?;
        text.map(|value| serde_json::from_str(&value).map_err(Into::into))
            .transpose()
    }

    pub fn put_cache(&self, key: &str, value: &Value) -> Result<()> {
        self.connection.execute("INSERT INTO cache VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value=excluded.value, collected_at=excluded.collected_at", params![key, value.to_string(), worklens_core::now()])?;
        Ok(())
    }

    pub fn agent(&self, id: &str) -> Result<Option<AgentSession>> {
        let text: Option<String> = self
            .connection
            .query_row("SELECT value FROM agents WHERE id=?", [id], |r| r.get(0))
            .optional()?;
        text.map(|value| serde_json::from_str(&value).map_err(Into::into))
            .transpose()
    }

    pub fn event_payload(&self, id: &str) -> Result<Option<String>> {
        Ok(self
            .connection
            .query_row("SELECT payload FROM events WHERE id=?", [id], |r| r.get(0))
            .optional()?)
    }

    pub fn agents(&self, repository_id: &str) -> Result<Vec<AgentSession>> {
        let mut stmt = self
            .connection
            .prepare("SELECT value FROM agents WHERE repository_id=?")?;
        let rows = stmt.query_map([repository_id], |r| r.get::<_, String>(0))?;
        rows.map(|row| {
            let mut session: AgentSession = serde_json::from_str(&row?)?;
            session.presence = worklens_core::presence(&session.last_seen, chrono::Utc::now());
            Ok(session)
        })
        .collect()
    }

    pub fn event(
        &mut self,
        event_id: &str,
        payload: &Value,
        session: &AgentSession,
    ) -> Result<bool> {
        let tx = self.connection.transaction()?;
        let previous: Option<(String, String)> = tx
            .query_row(
                "SELECT session_id,payload FROM events WHERE id=?",
                [event_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if let Some((id, original)) = previous {
            let encoded = payload.to_string();
            if id != session.id || original != encoded {
                return Err(error("Event ID reused with different content"));
            }
            return Ok(false);
        }
        tx.execute(
            "INSERT INTO events VALUES (?1,?2,?3,?4)",
            params![
                event_id,
                session.id,
                payload.to_string(),
                worklens_core::now()
            ],
        )?;
        tx.execute("INSERT INTO agents VALUES (?1,?2,?3) ON CONFLICT(id) DO UPDATE SET value=excluded.value", params![session.id, session.repository_id, serde_json::to_string(session)?])?;
        tx.commit()?;
        Ok(true)
    }
}
