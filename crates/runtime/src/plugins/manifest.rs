use crate::{error, Result};
use std::path::Path;
use worklens_core::PluginManifest;

pub fn load_manifest(dir: &Path) -> Result<PluginManifest> {
    let json_path = dir.join("plugin.json");
    let toml_path = dir.join("plugin.toml");

    let manifest = if json_path.exists() {
        let content = std::fs::read_to_string(&json_path)?;
        serde_json::from_str::<PluginManifest>(&content)
            .map_err(|e| error(format!("Invalid plugin.json in {}: {e}", dir.display())))?
    } else if toml_path.exists() {
        let content = std::fs::read_to_string(&toml_path)?;
        toml::from_str::<PluginManifest>(&content)
            .map_err(|e| error(format!("Invalid plugin.toml in {}: {e}", dir.display())))?
    } else {
        return Err(error(format!(
            "No plugin.json or plugin.toml found in {}",
            dir.display()
        )));
    };

    if manifest.id.trim().is_empty() {
        return Err(error("Plugin manifest 'id' cannot be empty"));
    }
    if manifest.name.trim().is_empty() {
        return Err(error("Plugin manifest 'name' cannot be empty"));
    }

    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_load_manifest_json_and_toml() {
        let dir = tempdir().unwrap();

        // 1. JSON manifest
        let json_manifest = r#"{
            "id": "test-plugin-tf",
            "name": "Custom Terraform Tool",
            "version": "1.0.0",
            "engines": [
                {
                    "id": "custom-tf",
                    "name": "Custom TF",
                    "kind": "iac",
                    "binaries": ["tofu", "terraform"],
                    "manifestPatterns": ["*.tf"],
                    "supportedActions": ["plan", "validate"]
                }
            ],
            "permissions": []
        }"#;
        std::fs::write(dir.path().join("plugin.json"), json_manifest).unwrap();
        let loaded = load_manifest(dir.path()).unwrap();
        assert_eq!(loaded.id, "test-plugin-tf");
        assert_eq!(loaded.engines.len(), 1);
        assert_eq!(loaded.engines[0].kind, worklens_core::EngineKind::IaC);
    }
}
