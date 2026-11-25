use crate::{error, service::text, service::Service, Result};
use serde_json::{json, Value};
use std::path::Path;
use worklens_core::{Operation, Request};

pub async fn dispatch(service: &Service, request: &Request) -> Result<Value> {
    let p = &request.params;

    match &request.operation {
        Operation::PluginList => {
            let list = service.plugins.list()?;
            Ok(serde_json::to_value(list)?)
        }

        Operation::PluginGet => {
            let id = text(p, "id")?;
            let plugin = service
                .plugins
                .get(id)?
                .ok_or_else(|| error(format!("Plugin '{id}' not found")))?;
            Ok(serde_json::to_value(plugin)?)
        }

        Operation::PluginInstall => {
            let path_str = text(p, "path")?;
            let path = Path::new(path_str);
            let metadata = service.plugins.install(path)?;
            service
                .plugins
                .sync_engines(&service.engines, &service.permissions)?;
            Ok(serde_json::to_value(metadata)?)
        }

        Operation::PluginUninstall => {
            let id = text(p, "id")?;
            let uninstalled = service.plugins.uninstall(id)?;
            service
                .plugins
                .sync_engines(&service.engines, &service.permissions)?;
            Ok(json!({ "uninstalled": uninstalled }))
        }

        Operation::PluginEnable => {
            let id = text(p, "id")?;
            service.plugins.set_enabled(id, true)?;
            service
                .plugins
                .sync_engines(&service.engines, &service.permissions)?;
            Ok(json!({ "enabled": true, "id": id }))
        }

        Operation::PluginDisable => {
            let id = text(p, "id")?;
            service.plugins.set_enabled(id, false)?;
            service
                .plugins
                .sync_engines(&service.engines, &service.permissions)?;
            Ok(json!({ "enabled": false, "id": id }))
        }

        Operation::EnginesList => {
            let engines = service.engines.list().await;
            Ok(serde_json::to_value(engines)?)
        }

        Operation::EngineRealtimeList => {
            let repo = service.repo(request).await.ok();
            let statuses = service.engines.realtime_list(repo.as_ref()).await;
            Ok(serde_json::to_value(statuses)?)
        }

        Operation::EngineRealtimeStatus => {
            let engine_id = text(p, "engineId")?;
            let repo = service.repo(request).await.ok();
            let status = service
                .engines
                .realtime_status(engine_id, repo.as_ref())
                .await?;
            Ok(serde_json::to_value(status)?)
        }

        Operation::EngineExecute => {
            let engine_id = text(p, "engineId")?;
            let action = text(p, "action")?;
            let caller_id = p["callerId"].as_str().unwrap_or("client");

            let repo = service.repo(request).await?;
            let result = service
                .engines
                .execute(
                    engine_id,
                    action,
                    &p["params"],
                    &repo,
                    caller_id,
                    &service.permissions,
                )
                .await?;
            Ok(result)
        }

        _ => Err(error("Invalid plugin operation")),
    }
}
