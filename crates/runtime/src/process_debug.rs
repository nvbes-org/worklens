use regex::Regex;
use std::net::TcpListener;
use worklens_core::DebugMode;

pub struct DebugHelper;

impl DebugHelper {
    pub fn find_available_port(start_port: u16) -> u16 {
        for port in start_port..start_port + 100 {
            if TcpListener::bind(("127.0.0.1", port)).is_ok() {
                return port;
            }
        }
        start_port
    }

    pub fn prepare_command_for_debug(
        command: &str,
        args: &[String],
        mode: DebugMode,
    ) -> (String, Vec<String>, Vec<(String, String)>) {
        let final_cmd = command.to_string();
        let final_args = args.to_vec();
        let mut envs = Vec::new();

        match mode {
            DebugMode::Node => {
                let port = Self::find_available_port(9229);
                let inspect_flag = format!("--inspect=127.0.0.1:{port}");
                envs.push(("NODE_OPTIONS".to_string(), inspect_flag));
            }
            DebugMode::Rust => {
                envs.push(("RUST_BACKTRACE".to_string(), "full".to_string()));
                envs.push(("RUST_LOG".to_string(), "debug".to_string()));
            }
            DebugMode::Web => {
                envs.push(("BROWSER".to_string(), "none".to_string()));
            }
            DebugMode::None => {}
        }

        (final_cmd, final_args, envs)
    }

    pub fn extract_node_inspector_url(log_text: &str) -> Option<String> {
        let re = Regex::new(r"ws://(127\.0\.0\.1|localhost):[0-9]+/[a-f0-9\-]+").unwrap();
        if let Some(mat) = re.find(log_text) {
            let ws_url = mat.as_str();
            let chrome_url = format!("devtools://devtools/bundled/js_app.html?ws={ws_url}");
            return Some(chrome_url);
        }
        None
    }

    pub fn extract_web_server_url(log_text: &str) -> Option<String> {
        let re = Regex::new(r"https?://(?:localhost|127\.0\.0\.1):[0-9]+(?:/[^\s]*)?").unwrap();
        if let Some(mat) = re.find(log_text) {
            return Some(mat.as_str().to_string());
        }
        None
    }

    pub fn parse_rustc_diagnostics(log_text: &str) -> Vec<RustDiagnostic> {
        let mut diagnostics = Vec::new();
        let re = Regex::new(r"(?m)^(error|warning)(?:\[(E\d+)\])?: (.*)$").unwrap();
        let loc_re = Regex::new(r"(?m)^\s+-->\s+([a-zA-Z0-9_\-./]+):(\d+):(\d+)").unwrap();

        let lines: Vec<&str> = log_text.lines().collect();
        for (i, line) in lines.iter().enumerate() {
            if let Some(cap) = re.captures(line) {
                let severity = cap
                    .get(1)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_default();
                let code = cap.get(2).map(|m| m.as_str().to_string());
                let message = cap
                    .get(3)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_default();

                let mut file = None;
                let mut line_num = None;
                let mut col_num = None;

                if let Some(next_line) = lines.get(i + 1) {
                    if let Some(loc_cap) = loc_re.captures(next_line) {
                        file = loc_cap.get(1).map(|m| m.as_str().to_string());
                        line_num = loc_cap.get(2).and_then(|m| m.as_str().parse().ok());
                        col_num = loc_cap.get(3).and_then(|m| m.as_str().parse().ok());
                    }
                }

                diagnostics.push(RustDiagnostic {
                    severity,
                    code,
                    message,
                    file,
                    line: line_num,
                    column: col_num,
                });
            }
        }
        diagnostics
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RustDiagnostic {
    pub severity: String,
    pub code: Option<String>,
    pub message: String,
    pub file: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
}
