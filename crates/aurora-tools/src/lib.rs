pub mod clipboard;
pub mod error;
pub mod keychain;
pub mod quickselect;
pub mod replay;
pub mod triggers;

pub use clipboard::{ClipboardEntry, SecretType, SmartClipboard};
pub use error::{AuroraError, Result};
pub use keychain::KeychainManager;
pub use quickselect::{QuickSelectKind, QuickSelectMatch, QuickSelectScanner};
pub use replay::{InstantReplayBuffer, TerminalSnapshot};
pub use triggers::{BadgePosition, TriggerAction, TriggerEngine, TriggerRule, WatermarkBadge};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quickselect_scanner() {
        let lines = vec![
            "Check PR at https://github.com/nvbes-org/worklens/pull/42 now",
            "Commit hash is 7f3a8b2c4e1d90f",
            "Server IP: 192.168.1.100",
            "Config at /Users/shayn/Development/worklens/Cargo.toml",
        ];

        let matches = QuickSelectScanner::scan_lines(&lines);
        assert!(matches.iter().any(|m| m.kind == QuickSelectKind::Url && m.text.contains("github.com")));
        assert!(matches.iter().any(|m| m.kind == QuickSelectKind::GitHash && m.text == "7f3a8b2c4e1d90f"));
        assert!(matches.iter().any(|m| m.kind == QuickSelectKind::IpAddress && m.text == "192.168.1.100"));
        assert!(matches.iter().any(|m| m.kind == QuickSelectKind::FilePath && m.text.contains("Cargo.toml")));

        // Check hint resolution
        let first_hint = &matches[0].hint;
        let resolved = QuickSelectScanner::resolve_hint(&matches, first_hint);
        assert!(resolved.is_some());
        assert_eq!(resolved.unwrap().text, matches[0].text);
    }

    #[test]
    fn test_secret_detection() {
        let aws_key = "Access key is AKIAIOSFODNN7EXAMPLE";
        assert_eq!(
            SmartClipboard::detect_secret(aws_key),
            Some(SecretType::AwsAccessKey)
        );

        let priv_key = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----";
        assert_eq!(
            SmartClipboard::detect_secret(priv_key),
            Some(SecretType::PrivateKey)
        );

        let safe = "git status";
        assert_eq!(SmartClipboard::detect_secret(safe), None);
    }

    #[test]
    fn test_instant_replay() {
        let mut replay = InstantReplayBuffer::new(10);
        replay.capture(24, 80, vec!["Frame 1".to_string()]);
        replay.capture(24, 80, vec!["Frame 2".to_string()]);
        replay.capture(24, 80, vec!["Frame 3".to_string()]);

        assert_eq!(replay.snapshot_count(), 3);
        assert_eq!(replay.get_earliest().unwrap().text_lines[0], "Frame 1");
        assert_eq!(replay.get_latest().unwrap().text_lines[0], "Frame 3");

        let middle = replay.scrub_ratio(0.5).unwrap();
        assert_eq!(middle.text_lines[0], "Frame 2");
    }

    #[test]
    fn test_triggers_and_badges() {
        let mut engine = TriggerEngine::new();
        engine
            .add_rule(TriggerRule {
                id: "error-trigger".to_string(),
                pattern: r"ERROR:.*".to_string(),
                action: TriggerAction::Notification {
                    title: "Build Failed".to_string(),
                    message: "An error was detected in terminal".to_string(),
                },
                enabled: true,
            })
            .unwrap();

        let actions = engine.process_text("Compiling... ERROR: compilation terminated");
        assert_eq!(actions.len(), 1);

        let badge = WatermarkBadge::git_branch("feat/aurora-term");
        assert_eq!(badge.text, " feat/aurora-term");
    }
}
