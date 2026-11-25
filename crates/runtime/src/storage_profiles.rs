use crate::{error, storage::Store, Result};
use lilia_core::BatchOperation;
use worklens_core::ConfigProfile;

impl Store {
    pub fn ensure_default_profile(&self) -> Result<()> {
        let profiles = self.list_config_profiles()?;
        if profiles.is_empty() {
            let default = ConfigProfile::default_local();
            self.save_config_profile(&default)?;
            self.set_active_config_profile(&default.id)?;
        }
        Ok(())
    }

    pub fn list_config_profiles(&self) -> Result<Vec<ConfigProfile>> {
        let active_id = self.setting("active_config_profile")?.unwrap_or_default();
        let session = self.db.system();
        let entries = session
            .json_scan("config_profiles", &lilia_db::Scan::all().limit(100))
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        let mut profiles: Vec<ConfigProfile> = Vec::new();
        for entry in entries {
            if let Ok(mut prof) = serde_json::from_value::<ConfigProfile>(entry.value()) {
                prof.is_active = prof.id == active_id;
                profiles.push(prof);
            }
        }
        profiles.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(profiles)
    }

    pub fn get_config_profile(&self, id: &str) -> Result<Option<ConfigProfile>> {
        let active_id = self.setting("active_config_profile")?.unwrap_or_default();
        let session = self.db.system();
        let entry = session
            .json_get("config_profiles", id)
            .map_err(|e| error(format!("LiliaDB error: {e}")))?;
        match entry {
            Some(e) => {
                let mut prof: ConfigProfile = serde_json::from_value(e.value())?;
                prof.is_active = prof.id == active_id;
                Ok(Some(prof))
            }
            None => Ok(None),
        }
    }

    pub fn save_config_profile(&self, profile: &ConfigProfile) -> Result<()> {
        let op = BatchOperation::JsonPut {
            space: "config_profiles".into(),
            id: profile.id.clone(),
            value: serde_json::to_value(profile)?,
            if_version: None,
        };
        self.batch(&[op])?;
        if profile.is_active {
            self.set("active_config_profile", &profile.id)?;
        }
        Ok(())
    }

    pub fn delete_config_profile(&self, id: &str) -> Result<bool> {
        let active = self.setting("active_config_profile")?.unwrap_or_default();
        if id == active {
            return Err(error("Cannot delete active configuration profile"));
        }
        let op = BatchOperation::JsonDelete {
            space: "config_profiles".into(),
            id: id.into(),
            if_version: None,
        };
        let res = self.batch(&[op])?;
        Ok(res.first().map_or(false, |r| r.deleted))
    }

    pub fn set_active_config_profile(&self, id: &str) -> Result<()> {
        let exists = self.get_config_profile(id)?.is_some();
        if !exists {
            return Err(error("Profile not found"));
        }
        self.set("active_config_profile", id)?;
        Ok(())
    }

    pub fn get_active_config_profile(&self) -> Result<ConfigProfile> {
        let active_id = self.setting("active_config_profile")?.unwrap_or_default();
        if !active_id.is_empty() {
            if let Some(prof) = self.get_config_profile(&active_id)? {
                return Ok(prof);
            }
        }
        let default = ConfigProfile::default_local();
        self.save_config_profile(&default)?;
        self.set_active_config_profile(&default.id)?;
        Ok(default)
    }
}
