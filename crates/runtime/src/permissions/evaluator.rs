use super::{storage::PermissionStore, types};
use crate::Result;
use std::path::Path;
use uuid::Uuid;
use worklens_core::{GrantStatus, PermissionAuditEntry, PermissionCheckResult, PermissionType};

#[derive(Clone)]
pub struct PermissionEvaluator {
    store: PermissionStore,
}

impl PermissionEvaluator {
    pub fn new(store: PermissionStore) -> Self {
        Self { store }
    }

    pub fn check(
        &self,
        plugin_id: &str,
        requested: &PermissionType,
        repo_trusted: bool,
    ) -> Result<PermissionCheckResult> {
        // Builtin Worklens system caller is always trusted
        if plugin_id == "worklens" || plugin_id == "system" {
            let res = PermissionCheckResult {
                allowed: true,
                reason: "System caller granted by default".into(),
            };
            self.log_audit(plugin_id, requested, &res)?;
            return Ok(res);
        }

        // Rule: Command execution or mutation strictly requires explicit repository trust
        match requested {
            PermissionType::ExecCommand { allow_mutation, .. }
                if *allow_mutation && !repo_trusted =>
            {
                let res = PermissionCheckResult {
                    allowed: false,
                    reason: "Repository trust required for command execution and mutations".into(),
                };
                self.log_audit(plugin_id, requested, &res)?;
                return Ok(res);
            }
            _ => {}
        }

        let grants = self.store.list_grants(Some(plugin_id))?;
        for grant in grants {
            if grant.status != GrantStatus::Granted {
                continue;
            }
            if self.matches_capability(&grant.permission, requested) {
                let res = PermissionCheckResult {
                    allowed: true,
                    reason: format!("Capability granted under {}", grant.permission_id),
                };
                self.log_audit(plugin_id, requested, &res)?;
                return Ok(res);
            }
        }

        let res = PermissionCheckResult {
            allowed: false,
            reason: format!("Permission not granted for plugin '{plugin_id}'"),
        };
        self.log_audit(plugin_id, requested, &res)?;
        Ok(res)
    }

    fn matches_capability(&self, granted: &PermissionType, requested: &PermissionType) -> bool {
        match (granted, requested) {
            (
                PermissionType::ExecCommand {
                    binary: g_bin,
                    allowed_args_patterns: g_args,
                    allow_mutation: g_mut,
                },
                PermissionType::ExecCommand {
                    binary: r_bin,
                    allowed_args_patterns: r_args,
                    allow_mutation: r_mut,
                },
            ) => {
                if g_bin != r_bin && g_bin != "*" {
                    return false;
                }
                if *r_mut && !g_mut {
                    return false;
                }
                types::match_arg_patterns(r_args, g_args)
            }
            (
                PermissionType::FsRead { paths: g_paths },
                PermissionType::FsRead { paths: r_paths },
            ) => r_paths
                .iter()
                .all(|r| types::match_path_patterns(Path::new(r), g_paths)),
            (
                PermissionType::FsWrite { paths: g_paths },
                PermissionType::FsWrite { paths: r_paths },
            ) => r_paths
                .iter()
                .all(|r| types::match_path_patterns(Path::new(r), g_paths)),
            (
                PermissionType::NetworkAccess {
                    domains: g_doms,
                    ports: g_ports,
                },
                PermissionType::NetworkAccess {
                    domains: r_doms,
                    ports: r_ports,
                },
            ) => {
                let dom_ok = r_doms.iter().all(|rd| {
                    g_doms.iter().any(|gd| {
                        gd == "*" || gd == rd || (gd.starts_with("*.") && rd.ends_with(&gd[1..]))
                    })
                });
                let port_ok = r_ports
                    .iter()
                    .all(|rp| g_ports.is_empty() || g_ports.contains(rp));
                dom_ok && port_ok
            }
            (
                PermissionType::Environment {
                    allowed_vars: g_allowed,
                    blocked_vars: g_blocked,
                },
                PermissionType::Environment {
                    allowed_vars: r_vars,
                    ..
                },
            ) => r_vars
                .iter()
                .all(|rv| types::is_env_var_allowed(rv, g_allowed, g_blocked)),
            (
                PermissionType::WorklensScope { operations: g_ops },
                PermissionType::WorklensScope { operations: r_ops },
            ) => r_ops
                .iter()
                .all(|ro| g_ops.contains(ro) || g_ops.contains(&"*".to_string())),
            (
                PermissionType::ProcessControl {
                    can_spawn: g_spawn,
                    can_kill: g_kill,
                },
                PermissionType::ProcessControl {
                    can_spawn: r_spawn,
                    can_kill: r_kill,
                },
            ) => (!*r_spawn || *g_spawn) && (!*r_kill || *g_kill),
            _ => false,
        }
    }

    fn log_audit(
        &self,
        plugin_id: &str,
        requested: &PermissionType,
        result: &PermissionCheckResult,
    ) -> Result<()> {
        let entry = PermissionAuditEntry {
            id: Uuid::new_v4().to_string(),
            plugin_id: plugin_id.to_string(),
            action: format!("{:?}", requested),
            resource: match requested {
                PermissionType::ExecCommand { binary, .. } => binary.clone(),
                PermissionType::FsRead { paths } | PermissionType::FsWrite { paths } => {
                    paths.join(",")
                }
                PermissionType::NetworkAccess { domains, .. } => domains.join(","),
                _ => "resource".to_string(),
            },
            decision: if result.allowed { "allowed" } else { "denied" }.into(),
            reason: result.reason.clone(),
            timestamp: worklens_core::now(),
        };
        self.store.record_audit(&entry)
    }
}
