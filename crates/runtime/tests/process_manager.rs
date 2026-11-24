use std::{collections::HashMap, path::PathBuf};
use worklens_core::{AutoKillPolicy, DebugMode, KillAction, LogStream, ProcessInfo, ProcessStatus};
use worklens_runtime::{
    process_autokill::AutoKillManager,
    process_debug::DebugHelper,
    process_env::EnvironmentManager,
    process_journal::ProcessJournalManager,
    process_scanner::discover_commands,
    process_sysinfo::SystemTelemetry,
};

#[test]
fn test_system_telemetry_machine_resources() {
    let mut telem = SystemTelemetry::new();
    let res = telem.get_machine_resources();
    assert!(res.total_memory_bytes > 0);
    assert!(!res.cpu_cores.is_empty());
}

#[test]
fn test_journal_parser_and_links() {
    let journal = ProcessJournalManager::new(None);
    let log_line = "  Vite server ready at http://localhost:5173/ in 120ms\nError in src/main.rs:42:10";
    let entries = journal.append("test_proc", LogStream::Stdout, log_line);
    assert_eq!(entries.len(), 2);

    let entry1 = &entries[0];
    assert!(!entry1.parsed_links.is_empty());
    assert_eq!(entry1.parsed_links[0].target, "http://localhost:5173/");

    let entry2 = &entries[1];
    assert_eq!(entry2.level, worklens_core::LogLevel::Error);
    assert_eq!(entry2.parsed_links[0].line, Some(42));
    assert_eq!(entry2.parsed_links[0].column, Some(10));
}

#[test]
fn test_autokill_policy_evaluation() {
    let policy = AutoKillPolicy {
        enabled: true,
        max_memory_bytes: Some(100 * 1024 * 1024), // 100 MB
        max_cpu_percent: None,
        cpu_sustained_seconds: None,
        max_runtime_seconds: None,
        action: KillAction::Warn,
        whitelist_pids: Vec::new(),
        whitelist_names: Vec::new(),
        protect_externals: true,
    };

    let autokill = AutoKillManager::new(policy);

    let procs = vec![
        ProcessInfo {
            id: "proc_1".into(),
            pid: 12345,
            ppid: None,
            name: "heavy-worker".into(),
            command: "node worker.js".into(),
            args: vec![],
            cwd: "/tmp".into(),
            component_id: None,
            status: ProcessStatus::Running,
            cpu_percent: 10.0,
            memory_bytes: 200 * 1024 * 1024, // 200 MB > 100 MB
            memory_percent: 5.0,
            disk_read_bytes_per_sec: 0,
            disk_write_bytes_per_sec: 0,
            uptime_seconds: 10,
            started_at: "2026-10-22T00:00:00Z".into(),
            ports: vec![],
            managed: true,
            debug_mode: DebugMode::None,
        },
    ];

    let events = autokill.evaluate_processes(&procs);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].action_taken, KillAction::Warn);
    assert!(events[0].reason.contains("Memory exceeded"));
}

#[test]
fn test_debug_helper_node_and_rust() {
    let (cmd, _args, envs) =
        DebugHelper::prepare_command_for_debug("node", &[], DebugMode::Node);
    assert_eq!(cmd, "node");
    assert!(envs.iter().any(|(k, v)| k == "NODE_OPTIONS" && v.contains("--inspect=")));

    let (_cmd, _args, rust_envs) =
        DebugHelper::prepare_command_for_debug("cargo", &[], DebugMode::Rust);
    assert!(rust_envs.iter().any(|(k, v)| k == "RUST_BACKTRACE" && v == "full"));
}

#[test]
fn test_environment_manager() {
    let env_mgr = EnvironmentManager::new();
    let profiles = env_mgr.list();
    assert!(!profiles.is_empty());

    let mut overrides = HashMap::new();
    overrides.insert("CUSTOM_KEY".into(), "CUSTOM_VAL".into());

    let resolved = env_mgr.resolve_variables(Some("profile_dev"), &PathBuf::from("/tmp"), &overrides);
    assert_eq!(resolved.get("NODE_ENV"), Some(&"development".to_string()));
    assert_eq!(resolved.get("CUSTOM_KEY"), Some(&"CUSTOM_VAL".to_string()));
}

#[test]
fn test_discover_commands_in_workspace() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let cmds = discover_commands(&root).expect("Failed to discover commands");
    assert!(!cmds.is_empty());
    assert!(cmds.iter().any(|c| c.ecosystem == "cargo" || c.ecosystem == "npm"));
}
