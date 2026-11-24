use chrono::{DateTime, Utc};

#[derive(Debug, Clone)]
pub struct TerminalSnapshot {
    pub timestamp: DateTime<Utc>,
    pub rows: usize,
    pub cols: usize,
    pub text_lines: Vec<String>,
}

pub struct InstantReplayBuffer {
    snapshots: Vec<TerminalSnapshot>,
    max_snapshots: usize,
}

impl Default for InstantReplayBuffer {
    fn default() -> Self {
        Self {
            snapshots: Vec::new(),
            max_snapshots: 1000,
        }
    }
}

impl InstantReplayBuffer {
    pub fn new(max_snapshots: usize) -> Self {
        Self {
            snapshots: Vec::with_capacity(max_snapshots),
            max_snapshots,
        }
    }

    pub fn capture(&mut self, rows: usize, cols: usize, text_lines: Vec<String>) {
        let snapshot = TerminalSnapshot {
            timestamp: Utc::now(),
            rows,
            cols,
            text_lines,
        };

        if self.snapshots.len() >= self.max_snapshots {
            self.snapshots.remove(0);
        }
        self.snapshots.push(snapshot);
    }

    pub fn snapshot_count(&self) -> usize {
        self.snapshots.len()
    }

    pub fn scrub_ratio(&self, ratio: f32) -> Option<&TerminalSnapshot> {
        if self.snapshots.is_empty() {
            return None;
        }
        let clamped = ratio.clamp(0.0, 1.0);
        let index = ((self.snapshots.len() - 1) as f32 * clamped).round() as usize;
        self.snapshots.get(index)
    }

    pub fn get_latest(&self) -> Option<&TerminalSnapshot> {
        self.snapshots.last()
    }

    pub fn get_earliest(&self) -> Option<&TerminalSnapshot> {
        self.snapshots.first()
    }
}
