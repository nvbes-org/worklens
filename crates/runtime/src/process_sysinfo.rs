use std::collections::HashMap;
use sysinfo::{Disks, Pid, ProcessesToUpdate, System};
use worklens_core::{DiskInfo, MachineResources};

pub struct SystemTelemetry {
    system: System,
    disks: Disks,
}

#[derive(Debug, Clone, Default)]
pub struct ProcessMetrics {
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub disk_read_bytes_per_sec: u64,
    pub disk_write_bytes_per_sec: u64,
    pub ppid: Option<u32>,
    pub status: String,
    pub running: bool,
}

impl Default for SystemTelemetry {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemTelemetry {
    pub fn new() -> Self {
        let mut system = System::new_all();
        system.refresh_all();
        let disks = Disks::new_with_refreshed_list();
        Self { system, disks }
    }

    pub fn refresh(&mut self) {
        self.system.refresh_all();
        self.disks.refresh(true);
    }

    pub fn refresh_processes_only(&mut self) {
        self.system.refresh_processes(ProcessesToUpdate::All, true);
    }

    pub fn get_machine_resources(&mut self) -> MachineResources {
        self.refresh();

        let total_memory_bytes = self.system.total_memory();
        let used_memory_bytes = self.system.used_memory();
        let available_memory_bytes = self.system.available_memory();
        let swap_total_bytes = self.system.total_swap();
        let swap_used_bytes = self.system.used_swap();

        let cpu_global_percent = self.system.global_cpu_usage();
        let cpu_cores: Vec<f32> = self.system.cpus().iter().map(|c| c.cpu_usage()).collect();
        let cpu_count = self.system.cpus().len();

        let load_avg = System::load_average();
        let load_average = [load_avg.one, load_avg.five, load_avg.fifteen];

        let disks: Vec<DiskInfo> = self
            .disks
            .iter()
            .map(|d| DiskInfo {
                name: d.name().to_string_lossy().to_string(),
                mount_point: d.mount_point().to_string_lossy().to_string(),
                total_bytes: d.total_space(),
                available_bytes: d.available_space(),
            })
            .collect();

        MachineResources {
            total_memory_bytes,
            used_memory_bytes,
            available_memory_bytes,
            swap_total_bytes,
            swap_used_bytes,
            cpu_global_percent,
            cpu_cores,
            cpu_count,
            load_average,
            disks,
        }
    }

    pub fn get_process_metrics(&mut self, pid: u32) -> Option<ProcessMetrics> {
        self.refresh_processes_only();
        let p = self.system.process(Pid::from_u32(pid))?;
        Some(ProcessMetrics {
            cpu_percent: p.cpu_usage(),
            memory_bytes: p.memory(),
            disk_read_bytes_per_sec: p.disk_usage().read_bytes,
            disk_write_bytes_per_sec: p.disk_usage().written_bytes,
            ppid: p.parent().map(|parent| parent.as_u32()),
            status: format!("{:?}", p.status()),
            running: true,
        })
    }

    pub fn get_process_tree_metrics(&mut self, root_pid: u32) -> ProcessMetrics {
        self.refresh_processes_only();
        let mut total_cpu = 0.0f32;
        let mut total_mem = 0u64;
        let mut total_read = 0u64;
        let mut total_write = 0u64;
        let mut root_found = false;
        let mut root_status = "Stopped".to_string();
        let mut root_ppid = None;

        let mut children_map: HashMap<Option<u32>, Vec<u32>> = HashMap::new();
        for (pid, proc) in self.system.processes() {
            let pid_u32 = pid.as_u32();
            let parent_u32 = proc.parent().map(|p| p.as_u32());
            children_map.entry(parent_u32).or_default().push(pid_u32);
        }

        let mut to_visit = vec![root_pid];
        while let Some(current_pid) = to_visit.pop() {
            if let Some(proc) = self.system.process(Pid::from_u32(current_pid)) {
                if current_pid == root_pid {
                    root_found = true;
                    root_status = format!("{:?}", proc.status());
                    root_ppid = proc.parent().map(|p| p.as_u32());
                }
                total_cpu += proc.cpu_usage();
                total_mem += proc.memory();
                total_read += proc.disk_usage().read_bytes;
                total_write += proc.disk_usage().written_bytes;

                if let Some(children) = children_map.get(&Some(current_pid)) {
                    to_visit.extend(children);
                }
            }
        }

        ProcessMetrics {
            cpu_percent: total_cpu,
            memory_bytes: total_mem,
            disk_read_bytes_per_sec: total_read,
            disk_write_bytes_per_sec: total_write,
            ppid: root_ppid,
            status: root_status,
            running: root_found,
        }
    }

    pub fn list_processes_in_directory(
        &mut self,
        directory: &std::path::Path,
    ) -> Vec<(u32, String, String, std::path::PathBuf)> {
        self.refresh_processes_only();
        let mut results = Vec::new();

        let canonical_dir = directory
            .canonicalize()
            .unwrap_or_else(|_| directory.to_path_buf());

        for (pid, proc) in self.system.processes() {
            if let Some(cwd) = proc.cwd() {
                let canonical_cwd = cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf());
                if canonical_cwd.starts_with(&canonical_dir) {
                    let cmd_str = proc
                        .cmd()
                        .iter()
                        .map(|s| s.to_string_lossy())
                        .collect::<Vec<_>>()
                        .join(" ");
                    let name = proc.name().to_string_lossy().to_string();
                    results.push((pid.as_u32(), name, cmd_str, cwd.to_path_buf()));
                }
            }
        }
        results
    }
}
