use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CommandBlock {
    pub id: String,
    pub command: String,
    pub cwd: String,
    pub output: String,
    pub start_time: DateTime<Utc>,
    pub duration_ms: Option<u64>,
    pub exit_code: Option<i32>,
    pub is_folded: bool,
}

impl CommandBlock {
    pub fn new(id: String, command: String, cwd: String) -> Self {
        Self {
            id,
            command,
            cwd,
            output: String::new(),
            start_time: Utc::now(),
            duration_ms: None,
            exit_code: None,
            is_folded: false,
        }
    }

    pub fn append_output(&mut self, text: &str) {
        self.output.push_str(text);
    }

    pub fn finish(&mut self, exit_code: i32) {
        self.exit_code = Some(exit_code);
        let elapsed = Utc::now().signed_duration_since(self.start_time);
        self.duration_ms = Some(elapsed.num_milliseconds().max(0) as u64);
    }

    pub fn toggle_fold(&mut self) {
        self.is_folded = !self.is_folded;
    }

    pub fn to_markdown(&self) -> String {
        let status_str = match self.exit_code {
            Some(0) => "✓ success".to_string(),
            Some(code) => format!("✗ failed (exit code: {code})"),
            None => "⏳ running".to_string(),
        };

        let duration_str = match self.duration_ms {
            Some(ms) if ms < 1000 => format!("{ms}ms"),
            Some(ms) => format!("{:.2}s", ms as f64 / 1000.0),
            None => "".to_string(),
        };

        format!(
            "### Command: `{}`\n*Directory: `{}` | Status: {} {}*\n\n```bash\n{}\n```\n",
            self.command,
            self.cwd,
            status_str,
            if duration_str.is_empty() {
                "".to_string()
            } else {
                format!("in {duration_str}")
            },
            self.output.trim_end()
        )
    }

    pub fn is_success(&self) -> bool {
        self.exit_code == Some(0)
    }

    pub fn is_running(&self) -> bool {
        self.exit_code.is_none()
    }
}
