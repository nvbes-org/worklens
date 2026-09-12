use crate::{Result, paths};
use sha2::{Digest, Sha256};
use std::path::Path;
use worklens_core::{IntegrityRecord, Project};

pub fn collect(root: &Path, project: &Project) -> Result<Vec<IntegrityRecord>> {
    let mut records = Vec::new();
    if (!project.external || project.kind == "vendor")
        && let Ok(path) = paths::confined(root, &project.manifest)
        && path.is_file()
    {
        let text = paths::read_bounded(&path, 1_000_000)?;
        records.push(IntegrityRecord {
            algorithm: "sha256".into(),
            value: format!("{:x}", Sha256::digest(text.as_bytes())),
            source: project.manifest.clone(),
            scope: "Measured manifest fingerprint (not package archive integrity)".into(),
        });
    }
    if let Some(key) = project
        .id
        .strip_prefix("npm-resolved:")
        .or_else(|| project.id.strip_prefix("npm:"))
        && root.join("pnpm-lock.yaml").exists()
    {
        let text = paths::read_bounded(&paths::confined(root, "pnpm-lock.yaml")?, 16_000_000)?;
        let value: serde_json::Value =
            serde_yaml_ng::from_str(&text).map_err(|e| crate::error(e.to_string()))?;
        if let Some(integrity) = value["packages"][key]["resolution"]["integrity"].as_str() {
            records.push(IntegrityRecord {
                algorithm: "SRI".into(),
                value: integrity.into(),
                source: format!("pnpm-lock.yaml#packages/{key}"),
                scope: "Declared package archive integrity; downloaded bytes not verified".into(),
            });
        }
    }
    if project.external
        && project.ecosystem == "cargo"
        && root.join("Cargo.lock").exists()
        && let Some((name, version)) = project
            .id
            .rsplit('#')
            .next()
            .and_then(|id| id.rsplit_once('@'))
    {
        let text = paths::read_bounded(&paths::confined(root, "Cargo.lock")?, 16_000_000)?;
        let lock: toml::Value = toml::from_str(&text).map_err(|e| crate::error(e.to_string()))?;
        if let Some(packages) = lock.get("package").and_then(toml::Value::as_array) {
            let matches: Vec<_> = packages
                .iter()
                .filter(|p| {
                    p.get("name").and_then(toml::Value::as_str) == Some(name)
                        && p.get("version").and_then(toml::Value::as_str) == Some(version)
                        && p.get("source")
                            .and_then(toml::Value::as_str)
                            .is_some_and(|source| {
                                project
                                    .id
                                    .strip_prefix("cargo:")
                                    .is_some_and(|id| id.starts_with(&format!("{source}#")))
                            })
                })
                .collect();
            if matches.len() == 1
                && let Some(checksum) = matches[0].get("checksum").and_then(toml::Value::as_str)
            {
                records.push(IntegrityRecord {
                    algorithm: "sha256".into(),
                    value: checksum.into(),
                    source: format!("Cargo.lock#{name}@{version}"),
                    scope: "Declared crate archive checksum; downloaded bytes not verified".into(),
                });
            }
        }
    }
    Ok(records)
}
