use super::manifest;
use crate::{paths::data_dir, Result};
use std::path::{Path, PathBuf};
use worklens_core::{PluginManifest, PluginMetadata, PluginStatus};

pub struct LoadedPlugin {
    pub manifest: PluginManifest,
    pub path: PathBuf,
}

pub fn plugins_dir() -> PathBuf {
    if let Some(home) = directories::UserDirs::new().map(|u| u.home_dir().to_path_buf()) {
        let dir = home.join(".worklens").join("plugins");
        if !dir.exists() {
            let _ = std::fs::create_dir_all(&dir);
        }
        return dir;
    }
    let fallback = data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("plugins");
    let _ = std::fs::create_dir_all(&fallback);
    fallback
}

pub fn discover_plugins(custom_dir: Option<&Path>) -> Result<Vec<LoadedPlugin>> {
    let dir = custom_dir
        .map(Path::to_path_buf)
        .unwrap_or_else(plugins_dir);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut plugins = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(Vec::new()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Ok(manifest) = manifest::load_manifest(&path) {
                plugins.push(LoadedPlugin { manifest, path });
            }
        }
    }

    Ok(plugins)
}

pub fn plugin_metadata(loaded: &LoadedPlugin, enabled: bool) -> PluginMetadata {
    let m = &loaded.manifest;
    PluginMetadata {
        id: m.id.clone(),
        name: m.name.clone(),
        version: m.version.clone(),
        description: m.description.clone(),
        author: m.author.clone(),
        homepage: m.homepage.clone(),
        path: loaded.path.to_string_lossy().to_string(),
        status: if enabled {
            PluginStatus::Enabled
        } else {
            PluginStatus::Disabled
        },
        engines_count: m.engines.len(),
        permissions_count: m.permissions.len(),
        installed_at: worklens_core::now(),
    }
}
