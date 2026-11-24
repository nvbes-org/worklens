use crate::{error, service::text, service::Service, Result};
use serde_json::{json, Value};
use worklens_core::{ConfigProfile, Operation, Request};

pub async fn dispatch(service: &Service, request: &Request) -> Result<Value> {
    let p = &request.params;

    match &request.operation {
        Operation::ConfigProfileList => {
            let list = {
                let db = service.db()?;
                db.list_config_profiles()?
            };
            Ok(serde_json::to_value(list)?)
        }

        Operation::ConfigProfileGet => {
            let id = text(p, "id")?;
            let profile = {
                let db = service.db()?;
                db.get_config_profile(id)?
                    .ok_or_else(|| error(format!("Profile '{id}' not found")))?
            };
            Ok(serde_json::to_value(profile)?)
        }

        Operation::ConfigProfileSave => {
            let profile: ConfigProfile = serde_json::from_value(p.clone())
                .map_err(|e| error(format!("Invalid profile payload: {e}")))?;
            {
                let db = service.db()?;
                db.save_config_profile(&profile)?;
            }
            if profile.is_active {
                service.transports.reconfigure(&profile).await?;
            }
            Ok(json!({ "saved": true, "id": profile.id }))
        }

        Operation::ConfigProfileDelete => {
            let id = text(p, "id")?;
            let deleted = {
                let db = service.db()?;
                db.delete_config_profile(id)?
            };
            Ok(json!({ "deleted": deleted }))
        }

        Operation::ConfigProfileActivate => {
            let id = text(p, "id")?;
            let profile = {
                let db = service.db()?;
                db.set_active_config_profile(id)?;
                db.get_active_config_profile()?
            };
            service.transports.reconfigure(&profile).await?;
            Ok(serde_json::to_value(profile)?)
        }

        Operation::ConfigProfileActiveGet => {
            let profile = {
                let db = service.db()?;
                db.get_active_config_profile()?
            };
            Ok(serde_json::to_value(profile)?)
        }

        Operation::TransportsStatus => {
            let profile = {
                let db = service.db()?;
                db.get_active_config_profile()?
            };
            let status = service.transports.status(&profile).await;
            Ok(serde_json::to_value(status)?)
        }

        Operation::TransportControl => {
            let transport = text(p, "transport")?;
            let action = text(p, "action")?;
            let profile = {
                let db = service.db()?;
                db.get_active_config_profile()?
            };

            match action {
                "start" | "enable" => {
                    service
                        .transports
                        .enable_transport(transport, &profile)
                        .await?;
                }
                "stop" | "disable" => {
                    service.transports.disable_transport(transport).await?;
                }
                "restart" => {
                    service.transports.disable_transport(transport).await?;
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                    service
                        .transports
                        .enable_transport(transport, &profile)
                        .await?;
                }
                _ => return Err(error(format!("Unknown action: {action}"))),
            }

            let status = service.transports.status(&profile).await;
            Ok(serde_json::to_value(status)?)
        }

        _ => Err(error("Invalid config operation")),
    }
}
