use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use uuid::Uuid;
use worklens_core::{AutoKillEvent, AutoKillPolicy, KillAction, ProcessInfo};

use lilia_core::BatchOperation;

#[derive(Clone)]
pub struct AutoKillManager {
    policy: Arc<Mutex<AutoKillPolicy>>,
    sustained_cpu_tracker: Arc<Mutex<HashMap<u32, u32>>>,
    events: Arc<Mutex<Vec<AutoKillEvent>>>,
    db: Option<Arc<lilia_db::Database>>,
}

impl Default for AutoKillManager {
    fn default() -> Self {
        Self::new(AutoKillPolicy::default())
    }
}

impl AutoKillManager {
    pub fn new(policy: AutoKillPolicy) -> Self {
        Self::with_db(policy, None)
    }

    pub fn with_db(
        policy: AutoKillPolicy,
        db: Option<Arc<lilia_db::Database>>,
    ) -> Self {
        let mut policy = policy;
        if let Some(ref db) = db {
            if let Ok(Some(entry)) = db.system().kv_get("autokill", b"policy") {
                if let Ok(p) = serde_json::from_slice(&entry.value) {
                    policy = p;
                }
            }
        }
        Self {
            policy: Arc::new(Mutex::new(policy)),
            sustained_cpu_tracker: Arc::new(Mutex::new(HashMap::new())),
            events: Arc::new(Mutex::new(Vec::new())),
            db,
        }
    }

    pub fn get_policy(&self) -> AutoKillPolicy {
        self.policy.lock().unwrap().clone()
    }

    pub fn set_policy(&self, policy: AutoKillPolicy) {
        let mut lock = self.policy.lock().unwrap();
        *lock = policy.clone();
        if let Some(ref db) = self.db {
            let bytes = serde_json::to_vec(&policy).unwrap_or_default();
            let _ = crate::storage::db_batch(db, &[BatchOperation::KvSet {
                namespace: "autokill".into(),
                key: b"policy".to_vec(),
                value: bytes,
                if_version: None,
                expires_at_ms: None,
            }]);
        }
    }

    pub fn get_events(&self) -> Vec<AutoKillEvent> {
        let current = self.events.lock().unwrap().clone();
        if current.is_empty() {
            if let Some(ref db) = self.db {
                if let Ok(items) = db.system().json_scan("autokill_events", &lilia_db::Scan::all().limit(50)) {
                    return items
                        .into_iter()
                        .filter_map(|entry| serde_json::from_value(entry.value()).ok())
                        .collect();
                }
            }
        }
        current
    }

    pub fn evaluate_processes(&self, processes: &[ProcessInfo]) -> Vec<AutoKillEvent> {
        let policy = self.get_policy();
        if !policy.enabled {
            return Vec::new();
        }

        let mut triggered_events = Vec::new();
        let mut cpu_tracker = self.sustained_cpu_tracker.lock().unwrap();

        for proc in processes {
            // Check whitelist
            if policy.whitelist_pids.contains(&proc.pid) {
                continue;
            }
            if policy
                .whitelist_names
                .iter()
                .any(|w| proc.name.to_lowercase().contains(&w.to_lowercase()))
            {
                continue;
            }

            // Check if protected external
            let cannot_kill = !proc.managed && policy.protect_externals;

            let mut violated_reason = None;

            // 1. Max Memory Check
            if let Some(max_mem) = policy.max_memory_bytes {
                if proc.memory_bytes > max_mem {
                    violated_reason = Some(format!(
                        "Memory exceeded: {:.2} MB > {:.2} MB",
                        proc.memory_bytes as f64 / (1024.0 * 1024.0),
                        max_mem as f64 / (1024.0 * 1024.0)
                    ));
                }
            }

            // 2. Sustained High CPU Check
            if let Some(max_cpu) = policy.max_cpu_percent {
                let sustained_limit = policy.cpu_sustained_seconds.unwrap_or(30);
                if proc.cpu_percent > max_cpu {
                    let count = cpu_tracker.entry(proc.pid).or_insert(0);
                    *count += 1;
                    if *count >= sustained_limit {
                        violated_reason = Some(format!(
                            "Sustained CPU exceeded: {:.1}% > {:.1}% for {}s",
                            proc.cpu_percent, max_cpu, count
                        ));
                    }
                } else {
                    cpu_tracker.remove(&proc.pid);
                }
            }

            // 3. Max Runtime Check
            if let Some(max_run) = policy.max_runtime_seconds {
                if proc.uptime_seconds > max_run {
                    violated_reason = Some(format!(
                        "Max execution time exceeded: {}s > {}s",
                        proc.uptime_seconds, max_run
                    ));
                }
            }

            if let Some(reason) = violated_reason {
                let action = if cannot_kill {
                    KillAction::Warn
                } else {
                    policy.action
                };

                let event = AutoKillEvent {
                    id: format!("ak_{}", Uuid::new_v4().simple()),
                    process_id: proc.id.clone(),
                    process_name: proc.name.clone(),
                    pid: proc.pid,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    reason,
                    memory_bytes: proc.memory_bytes,
                    cpu_percent: proc.cpu_percent,
                    action_taken: action,
                };

                self.execute_action(proc.pid, action);
                if let Some(ref db) = self.db {
                    let _ = crate::storage::db_batch(db, &[BatchOperation::JsonPut {
                        space: "autokill_events".into(),
                        id: event.id.clone(),
                        value: serde_json::to_value(&event).unwrap_or_default(),
                        if_version: None,
                    }]);
                }
                self.events.lock().unwrap().push(event.clone());
                triggered_events.push(event);
            }
        }

        triggered_events
    }

    fn execute_action(&self, pid: u32, action: KillAction) {
        match action {
            KillAction::Warn => {
                // Warning only - no signal sent
            }
            KillAction::GracefulKill => {
                #[cfg(unix)]
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }
            }
            KillAction::ImmediateKill => {
                #[cfg(unix)]
                unsafe {
                    libc::kill(pid as i32, libc::SIGKILL);
                }
            }
        }
    }
}
