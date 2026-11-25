pub mod block;
pub mod collector;

pub use block::CommandBlock;
pub use collector::BlockCollector;

#[cfg(test)]
mod tests {
    use super::*;
    use aurora_core::{OscEvent, ShellPromptKind};

    #[test]
    fn test_block_lifecycle_and_markdown() {
        let mut collector = BlockCollector::new();

        collector.handle_osc_event(&OscEvent::CurrentWorkingDirectory {
            hostname: None,
            path: "/Users/dev/worklens".to_string(),
        });

        collector.handle_osc_event(&OscEvent::ShellPromptStart(ShellPromptKind::Initial));
        collector.handle_osc_event(&OscEvent::ShellCommandStart);

        for ch in "cargo test".chars() {
            collector.record_input_char(ch);
        }

        collector.handle_osc_event(&OscEvent::ShellCommandExecuted);
        collector.append_output_chunk("Running unittests...\ntest result: ok\n");

        collector.handle_osc_event(&OscEvent::ShellCommandFinished { exit_code: 0 });

        assert_eq!(collector.blocks().len(), 1);
        let block = &collector.blocks()[0];
        assert_eq!(block.command, "cargo test");
        assert_eq!(block.cwd, "/Users/dev/worklens");
        assert!(block.is_success());
        assert!(block.output.contains("test result: ok"));

        let md = block.to_markdown();
        assert!(md.contains("### Command: `cargo test`"));
        assert!(md.contains("✓ success"));
    }

    #[test]
    fn test_block_navigation() {
        let mut collector = BlockCollector::new();

        for i in 1..=3 {
            collector.handle_osc_event(&OscEvent::ShellCommandStart);
            for ch in format!("echo {i}").chars() {
                collector.record_input_char(ch);
            }
            collector.handle_osc_event(&OscEvent::ShellCommandExecuted);
            collector.append_output_chunk(&format!("Result {i}\n"));
            collector.handle_osc_event(&OscEvent::ShellCommandFinished { exit_code: 0 });
        }

        assert_eq!(collector.blocks().len(), 3);
        assert_eq!(collector.focused_block().unwrap().command, "echo 3");

        let prev = collector.jump_previous();
        assert_eq!(prev.unwrap().command, "echo 2");

        let prev2 = collector.jump_previous();
        assert_eq!(prev2.unwrap().command, "echo 1");

        let next = collector.jump_next();
        assert_eq!(next.unwrap().command, "echo 2");
    }
}
