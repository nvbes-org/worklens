use crate::Result;
use serde_json::Value;
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};
use worklens_core::{DebugMode, DiscoveredCommand};

pub struct ProcessDirectoryScanner {
    root: PathBuf,
    known_pids: HashSet<u32>,
}

#[derive(Debug, Clone)]
pub struct DetectedProcessEvent {
    pub pid: u32,
    pub name: String,
    pub command: String,
    pub cwd: PathBuf,
    pub kind: ProcessEventKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessEventKind {
    Created,
    Terminated,
}

impl ProcessDirectoryScanner {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            known_pids: HashSet::new(),
        }
    }

    pub fn scan_directory_changes(
        &mut self,
        telemetry: &mut crate::process_sysinfo::SystemTelemetry,
    ) -> Vec<DetectedProcessEvent> {
        let current_procs = telemetry.list_processes_in_directory(&self.root);
        let current_pids: HashSet<u32> = current_procs.iter().map(|(pid, ..)| *pid).collect();
        let mut events = Vec::new();

        for (pid, name, cmd, cwd) in &current_procs {
            if !self.known_pids.contains(pid) {
                events.push(DetectedProcessEvent {
                    pid: *pid,
                    name: name.clone(),
                    command: cmd.clone(),
                    cwd: cwd.clone(),
                    kind: ProcessEventKind::Created,
                });
            }
        }

        for pid in &self.known_pids {
            if !current_pids.contains(pid) {
                events.push(DetectedProcessEvent {
                    pid: *pid,
                    name: String::new(),
                    command: String::new(),
                    cwd: self.root.clone(),
                    kind: ProcessEventKind::Terminated,
                });
            }
        }

        self.known_pids = current_pids;
        events
    }
}

pub fn discover_commands(root: &Path) -> Result<Vec<DiscoveredCommand>> {
    let mut commands = Vec::new();

    // 1. Discover Package.json scripts
    discover_package_json_commands(root, &mut commands);

    // 2. Discover Cargo.toml targets
    discover_cargo_commands(root, &mut commands);

    Ok(commands)
}

fn walk_dir_bounded<F>(dir: &Path, depth: usize, max_depth: usize, callback: &mut F)
where
    F: FnMut(&Path),
{
    if depth > max_depth {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".git"
            || name == "node_modules"
            || name == "target"
            || name == "dist"
            || name == ".worklens"
            || name == ".nx"
        {
            continue;
        }
        if path.is_dir() {
            walk_dir_bounded(&path, depth + 1, max_depth, callback);
        } else {
            callback(&path);
        }
    }
}

fn discover_package_json_commands(root: &Path, commands: &mut Vec<DiscoveredCommand>) {
    let mut files = Vec::new();
    walk_dir_bounded(root, 0, 4, &mut |p| {
        if p.file_name().map(|n| n == "package.json").unwrap_or(false) {
            files.push(p.to_path_buf());
        }
    });

    for path in files {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<Value>(&content) {
                let comp_name = json["name"].as_str().unwrap_or("app").to_string();
                let comp_dir = path
                    .parent()
                    .unwrap_or(root)
                    .strip_prefix(root)
                    .unwrap_or(Path::new("."))
                    .to_string_lossy()
                    .to_string();
                let comp_id = format!(
                    "npm:{}",
                    if comp_dir.is_empty() {
                        "root"
                    } else {
                        &comp_dir
                    }
                );

                if let Some(scripts) = json["scripts"].as_object() {
                    for (script_name, script_cmd) in scripts {
                        let cmd_str = script_cmd.as_str().unwrap_or("");
                        let suggested_debug = if cmd_str.contains("vite")
                            || cmd_str.contains("next")
                            || cmd_str.contains("webpack")
                            || cmd_str.contains("react-scripts")
                            || cmd_str.contains("serve")
                        {
                            DebugMode::Web
                        } else {
                            DebugMode::Node
                        };

                        commands.push(DiscoveredCommand {
                            id: format!("{comp_id}:{script_name}"),
                            component_id: comp_id.clone(),
                            component_name: comp_name.clone(),
                            component_path: comp_dir.clone(),
                            ecosystem: "npm".into(),
                            name: script_name.clone(),
                            command: format!("pnpm run {script_name}"),
                            args: vec!["run".into(), script_name.clone()],
                            suggested_debug_mode: suggested_debug,
                        });
                    }
                }
            }
        }
    }
}

fn discover_cargo_commands(root: &Path, commands: &mut Vec<DiscoveredCommand>) {
    let mut files = Vec::new();
    walk_dir_bounded(root, 0, 4, &mut |p| {
        if p.file_name().map(|n| n == "Cargo.toml").unwrap_or(false) {
            files.push(p.to_path_buf());
        }
    });

    for path in files {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(toml_val) = toml::from_str::<toml::Value>(&content) {
                let pkg_name = toml_val
                    .get("package")
                    .and_then(|p| p.get("name"))
                    .and_then(|n| n.as_str())
                    .unwrap_or("crate")
                    .to_string();

                let comp_dir = path
                    .parent()
                    .unwrap_or(root)
                    .strip_prefix(root)
                    .unwrap_or(Path::new("."))
                    .to_string_lossy()
                    .to_string();
                let comp_id = format!("cargo:{pkg_name}");

                // Standard cargo check & test
                commands.push(DiscoveredCommand {
                    id: format!("{comp_id}:check"),
                    component_id: comp_id.clone(),
                    component_name: pkg_name.clone(),
                    component_path: comp_dir.clone(),
                    ecosystem: "cargo".into(),
                    name: "cargo check".into(),
                    command: format!("cargo check -p {pkg_name}"),
                    args: vec!["check".into(), "-p".into(), pkg_name.clone()],
                    suggested_debug_mode: DebugMode::Rust,
                });

                commands.push(DiscoveredCommand {
                    id: format!("{comp_id}:test"),
                    component_id: comp_id.clone(),
                    component_name: pkg_name.clone(),
                    component_path: comp_dir.clone(),
                    ecosystem: "cargo".into(),
                    name: "cargo test".into(),
                    command: format!("cargo test -p {pkg_name}"),
                    args: vec!["test".into(), "-p".into(), pkg_name.clone()],
                    suggested_debug_mode: DebugMode::Rust,
                });

                // Bin targets
                if let Some(bins) = toml_val.get("bin").and_then(|b| b.as_array()) {
                    for bin in bins {
                        if let Some(bin_name) = bin.get("name").and_then(|n| n.as_str()) {
                            commands.push(DiscoveredCommand {
                                id: format!("{comp_id}:run:{bin_name}"),
                                component_id: comp_id.clone(),
                                component_name: pkg_name.clone(),
                                component_path: comp_dir.clone(),
                                ecosystem: "cargo".into(),
                                name: format!("run bin {bin_name}"),
                                command: format!("cargo run --bin {bin_name}"),
                                args: vec!["run".into(), "--bin".into(), bin_name.into()],
                                suggested_debug_mode: DebugMode::Rust,
                            });
                        }
                    }
                } else if path.parent().unwrap_or(root).join("src/main.rs").exists() {
                    commands.push(DiscoveredCommand {
                        id: format!("{comp_id}:run"),
                        component_id: comp_id.clone(),
                        component_name: pkg_name.clone(),
                        component_path: comp_dir.clone(),
                        ecosystem: "cargo".into(),
                        name: format!("run {pkg_name}"),
                        command: format!("cargo run -p {pkg_name}"),
                        args: vec!["run".into(), "-p".into(), pkg_name.clone()],
                        suggested_debug_mode: DebugMode::Rust,
                    });
                }
            }
        }
    }
}
