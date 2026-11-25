use crate::{error, service::text, service::Service, Result};
use serde_json::Value;
use worklens_core::{Operation, PermissionGrant, PermissionType, Request};

pub async fn dispatch(service: &Service, request: &Request) -> Result<Value> {
    let p = &request.params;

    match &request.operation {
        Operation::PermissionGrantsList => {
            let plugin_id = p["pluginId"].as_str();
            let grants = service.permissions.list_grants(plugin_id)?;
            Ok(serde_json::to_value(grants)?)
        }

        Operation::PermissionGrantSet => {
            let grant: PermissionGrant = serde_json::from_value(p.clone())
                .map_err(|e| error(format!("Invalid permission grant: {e}")))?;
            service
                .permissions
                .grant(&grant.plugin_id, &grant.permission_id, grant.permission)?;
            Ok(serde_json::json!({ "saved": true }))
        }

        Operation::PermissionAuditList => {
            let limit = p["limit"].as_u64().unwrap_or(50) as u32;
            let plugin_id = p["pluginId"].as_str();
            let logs = service.permissions.list_audit_logs(limit, plugin_id)?;
            Ok(serde_json::to_value(logs)?)
        }

        Operation::PermissionCheck => {
            let plugin_id = text(p, "pluginId")?;
            let permission: PermissionType = serde_json::from_value(p["permission"].clone())
                .map_err(|e| error(format!("Invalid permission payload: {e}")))?;

            let repo_trusted = if let Some(path) = p["repositoryPath"].as_str() {
                service.db()?.setting(&format!("trust:{path}"))?.as_deref() == Some("true")
            } else {
                false
            };

            let res = service
                .permissions
                .check(plugin_id, &permission, repo_trusted)?;
            Ok(serde_json::to_value(res)?)
        }

        _ => Err(error("Invalid permissions operation")),
    }
}
