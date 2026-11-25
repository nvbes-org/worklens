pub mod loader;
pub mod manifest;
pub mod plugin_engine;

use crate::{engines::EngineRegistry, permissions::PermissionManager, Result};
use loader::{discover_plugins, plugin_metadata, plugins_dir, LoadedPlugin};
use plugin_engine::DynamicPluginEngine;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use worklens_core::{PluginManifest, PluginMetadata};

#[derive(Clone)]
pub struct PluginManager {
    custom_dir: Option<PathBuf>,
    enabled_state: Arc<Mutex<HashMap<String, bool>>>,
}

impl PluginManager {
    pub fn new(custom_dir: Option<PathBuf>) -> Self {
        Self {
            custom_dir,
            enabled_state: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn list(&self) -> Result<Vec<PluginMetadata>> {
        let loaded = discover_plugins(self.custom_dir.as_deref())?;
        let state = self.enabled_state.lock().unwrap();
        let mut list = Vec::new();
        for p in loaded {
            let is_enabled = state.get(&p.manifest.id).copied().unwrap_or(true);
            list.push(plugin_metadata(&p, is_enabled));
        }
        Ok(list)
    }

    pub fn get(&self, id: &str) -> Result<Option<PluginMetadata>> {
        let list = self.list()?;
        Ok(list.into_iter().find(|p| p.id == id))
    }

    pub fn get_manifest(&self, id: &str) -> Result<Option<PluginManifest>> {
        let loaded = discover_plugins(self.custom_dir.as_deref())?;
        Ok(loaded
            .into_iter()
            .find(|p| p.manifest.id == id)
            .map(|p| p.manifest))
    }

    pub fn set_enabled(&self, id: &str, enabled: bool) -> Result<()> {
        let mut state = self.enabled_state.lock().unwrap();
        state.insert(id.to_string(), enabled);
        Ok(())
    }

    pub fn install(&self, source_path: &Path) -> Result<PluginMetadata> {
        let manifest = manifest::load_manifest(source_path)?;
        let target_dir = self
            .custom_dir
            .clone()
            .unwrap_or_else(plugins_dir)
            .join(&manifest.id);

        if target_dir.exists() {
            let _ = std::fs::remove_dir_all(&target_dir);
        }
        std::fs::create_dir_all(&target_dir)?;

        for entry in std::fs::read_dir(source_path)?.flatten() {
            let dest = target_dir.join(entry.file_name());
            if entry.file_type()?.is_file() {
                std::fs::copy(entry.path(), dest)?;
            }
        }

        self.set_enabled(&manifest.id, true)?;
        let loaded = LoadedPlugin {
            manifest: manifest.clone(),
            path: target_dir,
        };
        Ok(plugin_metadata(&loaded, true))
    }

    pub fn uninstall(&self, id: &str) -> Result<bool> {
        let target_dir = self.custom_dir.clone().unwrap_or_else(plugins_dir).join(id);
        if target_dir.exists() {
            std::fs::remove_dir_all(&target_dir)?;
            let mut state = self.enabled_state.lock().unwrap();
            state.remove(id);
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn sync_engines(
        &self,
        registry: &EngineRegistry,
        permissions: &PermissionManager,
    ) -> Result<()> {
        let loaded = discover_plugins(self.custom_dir.as_deref())?;
        let state = self.enabled_state.lock().unwrap();

        for plugin in loaded {
            let is_enabled = state.get(&plugin.manifest.id).copied().unwrap_or(true);
            if !is_enabled {
                continue;
            }

            // Register default permissions for the plugin if not already set
            for (idx, perm) in plugin.manifest.permissions.iter().enumerate() {
                let perm_id = format!("perm_{}_{idx}", plugin.manifest.id);
                let _ = permissions.grant(&plugin.manifest.id, &perm_id, perm.clone());
            }

            // Register dynamic tooling engines defined in the plugin
            for engine_decl in plugin.manifest.engines {
                let engine = DynamicPluginEngine::new(plugin.manifest.id.clone(), engine_decl);
                registry.register(Arc::new(engine));
            }
        }
        Ok(())
    }
}
