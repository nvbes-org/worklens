use crate::{cloud_scanner, service::Service, Result};
use serde_json::Value;
use std::path::Path;
use worklens_core::{CloudScanResult, Repository};

pub async fn dispatch(service: &Service, repo: &Repository, params: &Value) -> Result<Value> {
    let refresh = params["refresh"].as_bool().unwrap_or(false);
    let cache_key = format!("cloud_scan:{}", repo.path);

    if !refresh {
        if let Ok(Some(cached_val)) = service.db()?.cache(&cache_key) {
            if let Ok(res) = serde_json::from_value::<CloudScanResult>(cached_val) {
                return Ok(serde_json::to_value(res)?);
            }
        }
    }

    let root = Path::new(&repo.path);
    let scan_result = cloud_scanner::scan_repository(root).await?;

    // Cache the scan result
    if let Ok(serialized) = serde_json::to_value(&scan_result) {
        let _ = service.db()?.put_cache(&cache_key, &serialized);
    }

    Ok(serde_json::to_value(scan_result)?)
}
