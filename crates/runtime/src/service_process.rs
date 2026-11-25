use crate::{error, service::text, service::Service, Result};
use serde_json::{json, Value};
use std::{collections::HashMap, path::PathBuf};
use worklens_core::{AutoKillPolicy, DebugMode, EnvironmentProfile, Operation, Request};

pub async fn dispatch(service: &Service, request: &Request) -> Result<Value> {
    let p = &request.params;
    let repo_root = if let Some(ref r) = request.repository {
        PathBuf::from(r)
    } else {
        std::env::current_dir()?
    };

    match &request.operation {
        Operation::MachineResourcesGet => {
            let res = service.processes.get_machine_resources();
            Ok(serde_json::to_value(res)?)
        }

        Operation::ProcessList => {
            let list = service.processes.list_processes(&repo_root)?;
            Ok(serde_json::to_value(list)?)
        }

        Operation::ProcessStart => {
            let command = text(p, "command")?;
            let args: Vec<String> = p["args"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();

            let cwd = p["cwd"].as_str().map(PathBuf::from).unwrap_or(repo_root);
            let comp_id = p["componentId"].as_str().map(str::to_string);
            let profile_id = p["profileId"].as_str();

            let mut env_overrides = HashMap::new();
            if let Some(obj) = p["envOverrides"].as_object() {
                for (k, v) in obj {
                    if let Some(val) = v.as_str() {
                        env_overrides.insert(k.clone(), val.to_string());
                    }
                }
            }

            let debug_mode = match p["debugMode"].as_str() {
                Some("node") => DebugMode::Node,
                Some("rust") => DebugMode::Rust,
                Some("web") => DebugMode::Web,
                _ => DebugMode::None,
            };

            let proc = service
                .processes
                .start(
                    command,
                    &args,
                    &cwd,
                    comp_id,
                    profile_id,
                    &env_overrides,
                    debug_mode,
                )
                .await?;
            Ok(serde_json::to_value(proc)?)
        }

        Operation::ProcessStop => {
            let id = text(p, "id")?;
            service.processes.stop(id)?;
            Ok(json!({ "success": true }))
        }

        Operation::ProcessKill => {
            let id = text(p, "id")?;
            service.processes.kill(id)?;
            Ok(json!({ "success": true }))
        }

        Operation::ProcessRestart => {
            let id = text(p, "id")?;
            service.processes.stop(id)?;
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;

            let command = text(p, "command")?;
            let args: Vec<String> = p["args"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default();
            let cwd = p["cwd"].as_str().map(PathBuf::from).unwrap_or(repo_root);
            let comp_id = p["componentId"].as_str().map(str::to_string);
            let profile_id = p["profileId"].as_str();

            let debug_mode = match p["debugMode"].as_str() {
                Some("node") => DebugMode::Node,
                Some("rust") => DebugMode::Rust,
                Some("web") => DebugMode::Web,
                _ => DebugMode::None,
            };

            let proc = service
                .processes
                .start(
                    command,
                    &args,
                    &cwd,
                    comp_id,
                    profile_id,
                    &HashMap::new(),
                    debug_mode,
                )
                .await?;
            Ok(serde_json::to_value(proc)?)
        }

        Operation::ProcessSendInput => {
            let id = text(p, "id")?;
            let input_text = p["input"].as_str().unwrap_or("");
            service
                .processes
                .send_input(id, input_text.as_bytes().to_vec())
                .await?;
            Ok(json!({ "success": true }))
        }

        Operation::ProcessLogs => {
            let id = text(p, "id")?;
            let limit = p["limit"].as_u64().unwrap_or(200) as usize;
            let search = p["search"].as_str();
            let logs = service
                .processes
                .get_journal()
                .get_logs(id, None, None, search, limit);
            Ok(serde_json::to_value(logs)?)
        }

        Operation::ProcessClearLogs => {
            let id = text(p, "id")?;
            service.processes.get_journal().clear(id);
            Ok(json!({ "success": true }))
        }

        Operation::DiscoveredCommandsList => {
            let commands = service.processes.discover_commands_for_repo(&repo_root)?;
            Ok(serde_json::to_value(commands)?)
        }

        Operation::AutoKillPolicyGet => {
            let pol = service.processes.get_autokill().get_policy();
            Ok(serde_json::to_value(pol)?)
        }

        Operation::AutoKillPolicySet => {
            let policy: AutoKillPolicy = serde_json::from_value(p.clone())
                .map_err(|e| error(format!("Invalid auto-kill policy: {e}")))?;
            service.processes.get_autokill().set_policy(policy);
            Ok(json!({ "success": true }))
        }

        Operation::AutoKillEventsList => {
            let events = service.processes.get_autokill().get_events();
            Ok(serde_json::to_value(events)?)
        }

        Operation::EnvironmentProfilesList => {
            let profiles = service.processes.get_env_manager().list();
            Ok(serde_json::to_value(profiles)?)
        }

        Operation::EnvironmentProfileSave => {
            let profile: EnvironmentProfile = serde_json::from_value(p.clone())
                .map_err(|e| error(format!("Invalid environment profile: {e}")))?;
            service.processes.get_env_manager().save(profile);
            Ok(json!({ "success": true }))
        }

        Operation::EnvironmentProfileDelete => {
            let id = text(p, "id")?;
            service.processes.get_env_manager().delete(id);
            Ok(json!({ "success": true }))
        }

        _ => Err(error("Unknown process operation")),
    }
}
