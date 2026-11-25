use crate::Result;
use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
};
use worklens_core::EnvironmentProfile;

#[derive(Clone)]
pub struct EnvironmentManager {
    profiles: Arc<Mutex<HashMap<String, EnvironmentProfile>>>,
    db: Option<Arc<lilia_db::Database>>,
}

impl Default for EnvironmentManager {
    fn default() -> Self {
        Self::new()
    }
}

impl EnvironmentManager {
    pub fn new() -> Self {
        Self::with_db(None)
    }

    pub fn with_db(db: Option<Arc<lilia_db::Database>>) -> Self {
        let mut default_profiles = HashMap::new();

        let dev_id = "profile_dev".to_string();
        default_profiles.insert(
            dev_id.clone(),
            EnvironmentProfile {
                id: dev_id,
                name: "Development".into(),
                variables: HashMap::from([
                    ("NODE_ENV".into(), "development".into()),
                    ("RUST_BACKTRACE".into(), "1".into()),
                ]),
                inherits_host: true,
                env_file_path: Some(".env".into()),
            },
        );

        let test_id = "profile_test".to_string();
        default_profiles.insert(
            test_id.clone(),
            EnvironmentProfile {
                id: test_id,
                name: "Testing".into(),
                variables: HashMap::from([
                    ("NODE_ENV".into(), "test".into()),
                    ("CI".into(), "true".into()),
                ]),
                inherits_host: true,
                env_file_path: Some(".env.test".into()),
            },
        );

        if let Some(ref db) = db {
            if let Ok(items) = db.system().json_scan("env_profiles", &lilia_db::Scan::all().limit(100)) {
                if !items.is_empty() {
                    for entry in items {
                        if let Ok(p) = serde_json::from_value::<EnvironmentProfile>(entry.value()) {
                            default_profiles.insert(p.id.clone(), p);
                        }
                    }
                } else {
                    for p in default_profiles.values() {
                        let _ = crate::storage::db_batch(db, &[lilia_core::BatchOperation::JsonPut {
                            space: "env_profiles".into(),
                            id: p.id.clone(),
                            value: serde_json::to_value(p).unwrap_or_default(),
                            if_version: None,
                        }]);
                    }
                }
            }
        }

        Self {
            profiles: Arc::new(Mutex::new(default_profiles)),
            db,
        }
    }

    pub fn list(&self) -> Vec<EnvironmentProfile> {
        self.profiles.lock().unwrap().values().cloned().collect()
    }

    pub fn save(&self, profile: EnvironmentProfile) {
        let mut lock = self.profiles.lock().unwrap();
        lock.insert(profile.id.clone(), profile.clone());
        if let Some(ref db) = self.db {
            let _ = crate::storage::db_batch(db, &[lilia_core::BatchOperation::JsonPut {
                space: "env_profiles".into(),
                id: profile.id.clone(),
                value: serde_json::to_value(&profile).unwrap_or_default(),
                if_version: None,
            }]);
        }
    }

    pub fn delete(&self, id: &str) {
        let mut lock = self.profiles.lock().unwrap();
        lock.remove(id);
        if let Some(ref db) = self.db {
            let _ = crate::storage::db_batch(db, &[lilia_core::BatchOperation::JsonDelete {
                space: "env_profiles".into(),
                id: id.to_string(),
                if_version: None,
            }]);
        }
    }

    pub fn get(&self, id: &str) -> Option<EnvironmentProfile> {
        self.profiles.lock().unwrap().get(id).cloned()
    }

    pub fn load_env_file(path: &Path) -> Result<HashMap<String, String>> {
        let mut map = HashMap::new();
        if !path.exists() {
            return Ok(map);
        }
        let content = std::fs::read_to_string(path)?;
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = trimmed.split_once('=') {
                let key = k.trim().to_string();
                let val = v.trim().trim_matches('"').trim_matches('\'').to_string();
                map.insert(key, val);
            }
        }
        Ok(map)
    }

    pub fn resolve_variables(
        &self,
        profile_id: Option<&str>,
        workspace_root: &Path,
        overrides: &HashMap<String, String>,
    ) -> HashMap<String, String> {
        let mut result = HashMap::new();

        if let Some(pid) = profile_id {
            if let Some(profile) = self.get(pid) {
                if let Some(ref env_rel) = profile.env_file_path {
                    let env_path = workspace_root.join(env_rel);
                    if let Ok(file_vars) = Self::load_env_file(&env_path) {
                        result.extend(file_vars);
                    }
                }
                result.extend(profile.variables);
            }
        } else {
            let default_env = workspace_root.join(".env");
            if let Ok(file_vars) = Self::load_env_file(&default_env) {
                result.extend(file_vars);
            }
        }

        result.extend(overrides.clone());
        result
    }
}
