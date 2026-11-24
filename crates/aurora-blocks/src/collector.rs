use crate::block::CommandBlock;
use aurora_core::OscEvent;
use uuid::Uuid;

pub struct BlockCollector {
    blocks: Vec<CommandBlock>,
    current_cwd: String,
    pending_command: String,
    active_block_index: Option<usize>,
    focused_block_index: Option<usize>,
}

impl Default for BlockCollector {
    fn default() -> Self {
        Self {
            blocks: Vec::new(),
            current_cwd: std::env::current_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| "/".to_string()),
            pending_command: String::new(),
            active_block_index: None,
            focused_block_index: None,
        }
    }
}

impl BlockCollector {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn handle_osc_event(&mut self, event: &OscEvent) {
        match event {
            OscEvent::CurrentWorkingDirectory { path, .. } => {
                self.current_cwd = path.clone();
            }
            OscEvent::ShellPromptStart(_) => {
                // Prompt starts: if an active block was running, finish it with default 0 if not finished
                if let Some(idx) = self.active_block_index {
                    if self.blocks[idx].is_running() {
                        self.blocks[idx].finish(0);
                    }
                    self.active_block_index = None;
                }
                self.pending_command.clear();
            }
            OscEvent::ShellCommandStart => {
                // Command input started
                self.pending_command.clear();
            }
            OscEvent::ShellCommandExecuted => {
                // Command execution starts, instantiate new block
                let block_id = format!("blk_{}", Uuid::new_v4().simple());
                let cmd = if self.pending_command.is_empty() {
                    "command".to_string()
                } else {
                    self.pending_command.clone()
                };

                let block = CommandBlock::new(block_id, cmd, self.current_cwd.clone());
                self.blocks.push(block);
                let new_idx = self.blocks.len() - 1;
                self.active_block_index = Some(new_idx);
                self.focused_block_index = Some(new_idx);
            }
            OscEvent::ShellCommandFinished { exit_code } => {
                if let Some(idx) = self.active_block_index {
                    self.blocks[idx].finish(*exit_code);
                    self.active_block_index = None;
                }
            }
            _ => {}
        }
    }

    pub fn record_input_char(&mut self, c: char) {
        if c == '\r' || c == '\n' {
            return;
        }
        self.pending_command.push(c);
    }

    pub fn append_output_chunk(&mut self, text: &str) {
        if let Some(idx) = self.active_block_index {
            self.blocks[idx].append_output(text);
        }
    }

    pub fn blocks(&self) -> &[CommandBlock] {
        &self.blocks
    }

    pub fn active_block(&self) -> Option<&CommandBlock> {
        self.active_block_index.and_then(|idx| self.blocks.get(idx))
    }

    pub fn focused_block(&self) -> Option<&CommandBlock> {
        self.focused_block_index.and_then(|idx| self.blocks.get(idx))
    }

    pub fn jump_previous(&mut self) -> Option<&CommandBlock> {
        if self.blocks.is_empty() {
            return None;
        }
        let next_idx = match self.focused_block_index {
            Some(idx) => idx.saturating_sub(1),
            None => self.blocks.len().saturating_sub(1),
        };
        self.focused_block_index = Some(next_idx);
        self.blocks.get(next_idx)
    }

    pub fn jump_next(&mut self) -> Option<&CommandBlock> {
        if self.blocks.is_empty() {
            return None;
        }
        let next_idx = match self.focused_block_index {
            Some(idx) => (idx + 1).min(self.blocks.len() - 1),
            None => 0,
        };
        self.focused_block_index = Some(next_idx);
        self.blocks.get(next_idx)
    }

    pub fn export_all_markdown(&self) -> String {
        let mut md = String::new();
        for block in &self.blocks {
            md.push_str(&block.to_markdown());
            md.push('\n');
        }
        md
    }
}
