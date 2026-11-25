use crate::{
    error,
    process_autokill::AutoKillManager,
    process_debug::DebugHelper,
    process_env::EnvironmentManager,
    process_journal::ProcessJournalManager,
    process_scanner::{discover_commands, ProcessDirectoryScanner},
    process_sysinfo::SystemTelemetry,
    Result,
};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
    sync::mpsc,
};
use uuid::Uuid;
use worklens_core::{DebugMode, DiscoveredCommand, MachineResources, ProcessInfo, ProcessStatus};

struct ManagedSession {
    pub id: String,
    pub pid: u32,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub component_id: Option<String>,
    pub started_at: String,
    pub status: ProcessStatus,
    pub debug_mode: DebugMode,
    pub stdin_tx: Option<mpsc::Sender<Vec<u8>>>,
    pub ports: Vec<u16>,
}

#[derive(Clone)]
pub struct ProcessManager {
    telemetry: Arc<Mutex<SystemTelemetry>>,
    journal: ProcessJournalManager,
    autokill: AutoKillManager,
    env_manager: EnvironmentManager,
    scanner: Arc<Mutex<HashMap<PathBuf, ProcessDirectoryScanner>>>,
    sessions: Arc<Mutex<HashMap<String, ManagedSession>>>,
}

impl ProcessManager {
    pub fn new(data_dir: Option<PathBuf>) -> Self {
        Self::with_db(data_dir, None)
    }

    pub fn with_db(
        data_dir: Option<PathBuf>,
        db: Option<Arc<lilia_db::Database>>,
    ) -> Self {
        let log_dir = data_dir.map(|d| d.join("logs"));
        Self {
            telemetry: Arc::new(Mutex::new(SystemTelemetry::new())),
            journal: ProcessJournalManager::with_db(log_dir, db.clone()),
            autokill: AutoKillManager::with_db(
                worklens_core::AutoKillPolicy::default(),
                db.clone(),
            ),
            env_manager: EnvironmentManager::with_db(db),
            scanner: Arc::new(Mutex::new(HashMap::new())),
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn get_telemetry(&self) -> Arc<Mutex<SystemTelemetry>> {
        self.telemetry.clone()
    }

    pub fn get_journal(&self) -> &ProcessJournalManager {
        &self.journal
    }

    pub fn get_autokill(&self) -> &AutoKillManager {
        &self.autokill
    }

    pub fn get_env_manager(&self) -> &EnvironmentManager {
        &self.env_manager
    }

    pub fn get_machine_resources(&self) -> MachineResources {
        let mut telem = self.telemetry.lock().unwrap();
        telem.get_machine_resources()
    }

    pub fn discover_commands_for_repo(&self, root: &Path) -> Result<Vec<DiscoveredCommand>> {
        discover_commands(root)
    }

    pub async fn start(
        &self,
        command_str: &str,
        args: &[String],
        cwd: &Path,
        component_id: Option<String>,
        profile_id: Option<&str>,
        env_overrides: &HashMap<String, String>,
        debug_mode: DebugMode,
    ) -> Result<ProcessInfo> {
        let session_id = format!("proc_{}", Uuid::new_v4().simple());
        let (cmd, cmd_args, debug_envs) =
            DebugHelper::prepare_command_for_debug(command_str, args, debug_mode);

        let mut env_map = self
            .env_manager
            .resolve_variables(profile_id, cwd, env_overrides);
        for (k, v) in debug_envs {
            env_map.insert(k, v);
        }

        // Setup PATH
        let mut search_paths: Vec<_> =
            std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect();
        search_paths
            .extend(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].map(PathBuf::from));
        if let Some(home) = directories::BaseDirs::new() {
            search_paths.extend(
                [".cargo/bin", ".local/share/pnpm", ".local/bin", ".bun/bin"]
                    .map(|p| home.home_dir().join(p)),
            );
        }
        let executable_path = std::env::join_paths(search_paths)
            .map_err(|_| error("Invalid executable search path"))?;

        let mut child_cmd = Command::new(&cmd);
        child_cmd
            .args(&cmd_args)
            .current_dir(cwd)
            .env("PATH", executable_path)
            .envs(&env_map)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = child_cmd
            .spawn()
            .map_err(|e| error(format!("Failed to spawn process: {e}")))?;
        let pid = child.id().ok_or_else(|| error("Process has no PID"))?;

        let (stdin_tx, mut stdin_rx) = mpsc::channel::<Vec<u8>>(32);
        if let Some(mut stdin) = child.stdin.take() {
            tokio::spawn(async move {
                while let Some(bytes) = stdin_rx.recv().await {
                    if stdin.write_all(&bytes).await.is_err() {
                        break;
                    }
                    let _ = stdin.flush().await;
                }
            });
        }

        // Spawn stdout reader
        let journal_stdout = self.journal.clone();
        let s_id = session_id.clone();
        if let Some(mut stdout) = child.stdout.take() {
            tokio::spawn(async move {
                let mut buf = [0u8; 4096];
                while let Ok(n) = stdout.read(&mut buf).await {
                    if n == 0 {
                        break;
                    }
                    let text = String::from_utf8_lossy(&buf[..n]);
                    journal_stdout.append(&s_id, worklens_core::LogStream::Stdout, &text);
                }
            });
        }

        // Spawn stderr reader
        let journal_stderr = self.journal.clone();
        let s_id_err = session_id.clone();
        if let Some(mut stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let mut buf = [0u8; 4096];
                while let Ok(n) = stderr.read(&mut buf).await {
                    if n == 0 {
                        break;
                    }
                    let text = String::from_utf8_lossy(&buf[..n]);
                    journal_stderr.append(&s_id_err, worklens_core::LogStream::Stderr, &text);
                }
            });
        }

        let started_at = chrono::Utc::now().to_rfc3339();
        let proc_name = Path::new(&cmd)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| cmd.clone());

        let session = ManagedSession {
            id: session_id.clone(),
            pid,
            name: proc_name.clone(),
            command: cmd.clone(),
            args: cmd_args.clone(),
            cwd: cwd.to_string_lossy().to_string(),
            component_id: component_id.clone(),
            started_at: started_at.clone(),
            status: ProcessStatus::Running,
            debug_mode,
            stdin_tx: Some(stdin_tx),
            ports: Vec::new(),
        };

        self.sessions
            .lock()
            .unwrap()
            .insert(session_id.clone(), session);

        // Child exit monitor
        let sessions_exit = self.sessions.clone();
        let s_id_exit = session_id.clone();
        let journal_exit = self.journal.clone();
        tokio::spawn(async move {
            let status = child.wait().await;
            let mut lock = sessions_exit.lock().unwrap();
            if let Some(s) = lock.get_mut(&s_id_exit) {
                match status {
                    Ok(exit) if exit.success() => {
                        s.status = ProcessStatus::Stopped;
                        journal_exit.append(
                            &s_id_exit,
                            worklens_core::LogStream::System,
                            "Process finished successfully (exit code 0)",
                        );
                    }
                    Ok(exit) => {
                        s.status = ProcessStatus::Failed;
                        let code = exit.code().unwrap_or(-1);
                        journal_exit.append(
                            &s_id_exit,
                            worklens_core::LogStream::System,
                            &format!("Process failed (exit code {code})"),
                        );
                    }
                    Err(e) => {
                        s.status = ProcessStatus::Failed;
                        journal_exit.append(
                            &s_id_exit,
                            worklens_core::LogStream::System,
                            &format!("Process error: {e}"),
                        );
                    }
                }
            }
        });

        Ok(ProcessInfo {
            id: session_id,
            pid,
            ppid: None,
            name: proc_name,
            command: cmd,
            args: cmd_args,
            cwd: cwd.to_string_lossy().to_string(),
            component_id,
            status: ProcessStatus::Running,
            cpu_percent: 0.0,
            memory_bytes: 0,
            memory_percent: 0.0,
            disk_read_bytes_per_sec: 0,
            disk_write_bytes_per_sec: 0,
            uptime_seconds: 0,
            started_at,
            ports: Vec::new(),
            managed: true,
            debug_mode,
        })
    }

    pub fn stop(&self, process_id: &str) -> Result<()> {
        let pid = {
            let mut lock = self.sessions.lock().unwrap();
            let session = lock
                .get_mut(process_id)
                .ok_or_else(|| error("Process not found"))?;
            session.status = ProcessStatus::Stopped;
            session.pid
        };

        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }

        self.journal.append(
            process_id,
            worklens_core::LogStream::System,
            "SIGTERM signal sent to process",
        );
        Ok(())
    }

    pub fn kill(&self, process_id: &str) -> Result<()> {
        let pid = {
            let mut lock = self.sessions.lock().unwrap();
            let session = lock
                .get_mut(process_id)
                .ok_or_else(|| error("Process not found"))?;
            session.status = ProcessStatus::Killed;
            session.pid
        };

        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGKILL);
        }

        self.journal.append(
            process_id,
            worklens_core::LogStream::System,
            "SIGKILL signal sent to process",
        );
        Ok(())
    }

    pub async fn send_input(&self, process_id: &str, input: Vec<u8>) -> Result<()> {
        let tx = {
            let lock = self.sessions.lock().unwrap();
            let session = lock
                .get(process_id)
                .ok_or_else(|| error("Process not found"))?;
            session.stdin_tx.clone()
        };

        if let Some(tx) = tx {
            tx.send(input)
                .await
                .map_err(|e| error(format!("Failed to send stdin: {e}")))?;
            Ok(())
        } else {
            Err(error("Process stdin not available"))
        }
    }

    pub fn list_processes(&self, workspace_root: &Path) -> Result<Vec<ProcessInfo>> {
        let mut telem = self.telemetry.lock().unwrap();
        let total_sys_mem = telem.get_machine_resources().total_memory_bytes.max(1);

        let mut results = Vec::new();

        // 1. Managed processes
        {
            let mut lock = self.sessions.lock().unwrap();
            for session in lock.values_mut() {
                let metrics = telem.get_process_tree_metrics(session.pid);
                if !metrics.running && session.status == ProcessStatus::Running {
                    session.status = ProcessStatus::Stopped;
                }

                // Check logs for detected server URLs/ports
                let logs = self.journal.get_logs(&session.id, None, None, None, 50);
                for entry in logs {
                    for link in &entry.parsed_links {
                        if link.kind == worklens_core::ParsedLinkKind::Url {
                            if let Ok(url) = reqwest::Url::parse(&link.target) {
                                if let Some(p) = url.port() {
                                    if !session.ports.contains(&p) {
                                        session.ports.push(p);
                                    }
                                }
                            }
                        }
                    }
                }

                let uptime =
                    if let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(&session.started_at) {
                        chrono::Utc::now()
                            .signed_duration_since(parsed)
                            .num_seconds()
                            .max(0) as u64
                    } else {
                        0
                    };

                let mem_percent = (metrics.memory_bytes as f32 / total_sys_mem as f32) * 100.0;

                results.push(ProcessInfo {
                    id: session.id.clone(),
                    pid: session.pid,
                    ppid: metrics.ppid,
                    name: session.name.clone(),
                    command: session.command.clone(),
                    args: session.args.clone(),
                    cwd: session.cwd.clone(),
                    component_id: session.component_id.clone(),
                    status: session.status,
                    cpu_percent: metrics.cpu_percent,
                    memory_bytes: metrics.memory_bytes,
                    memory_percent: mem_percent,
                    disk_read_bytes_per_sec: metrics.disk_read_bytes_per_sec,
                    disk_write_bytes_per_sec: metrics.disk_write_bytes_per_sec,
                    uptime_seconds: uptime,
                    started_at: session.started_at.clone(),
                    ports: session.ports.clone(),
                    managed: true,
                    debug_mode: session.debug_mode,
                });
            }
        }

        // 2. External processes detected in the repository directory
        let managed_pids: Vec<u32> = results.iter().map(|p| p.pid).collect();
        {
            let mut scanners = self.scanner.lock().unwrap();
            let scanner = scanners
                .entry(workspace_root.to_path_buf())
                .or_insert_with(|| ProcessDirectoryScanner::new(workspace_root.to_path_buf()));
            let _events = scanner.scan_directory_changes(&mut telem);
        }
        let external_procs = telem.list_processes_in_directory(workspace_root);

        for (ext_pid, name, cmd, cwd) in external_procs {
            if managed_pids.contains(&ext_pid) || name.contains("worklens") {
                continue;
            }
            let metrics = telem.get_process_metrics(ext_pid).unwrap_or_default();
            let mem_percent = (metrics.memory_bytes as f32 / total_sys_mem as f32) * 100.0;

            results.push(ProcessInfo {
                id: format!("ext_{ext_pid}"),
                pid: ext_pid,
                ppid: metrics.ppid,
                name,
                command: cmd,
                args: Vec::new(),
                cwd: cwd.to_string_lossy().to_string(),
                component_id: None,
                status: if metrics.running {
                    ProcessStatus::Running
                } else {
                    ProcessStatus::Stopped
                },
                cpu_percent: metrics.cpu_percent,
                memory_bytes: metrics.memory_bytes,
                memory_percent: mem_percent,
                disk_read_bytes_per_sec: metrics.disk_read_bytes_per_sec,
                disk_write_bytes_per_sec: metrics.disk_write_bytes_per_sec,
                uptime_seconds: 0,
                started_at: chrono::Utc::now().to_rfc3339(),
                ports: Vec::new(),
                managed: false,
                debug_mode: DebugMode::None,
            });
        }

        // Run Auto-Killer watchdog pass
        let _ = self.autokill.evaluate_processes(&results);

        Ok(results)
    }
}
