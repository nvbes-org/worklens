pub mod error;
pub mod grid;
pub mod keyboard;
pub mod osc;
pub mod parser;
pub mod pty;
pub mod shell_integration;

pub use error::{AuroraError, Result};
pub use grid::{Cell, CellFlags, Color, Cursor, TerminalGrid, UnderlineStyle};
pub use keyboard::{KeyEventType, KittyKeyboardFlags, KittyKeyboardProtocol, Modifiers};
pub use osc::{OscEvent, OscParser, ShellPromptKind};
pub use parser::AnsiParser;
pub use pty::{NativePty, PtySize};
pub use shell_integration::ShellType;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_grid_write_and_scroll() {
        let mut grid = TerminalGrid::new(2, 4, 10);
        let cell = Cell::default();

        grid.write_char('A', &cell);
        grid.write_char('B', &cell);
        assert_eq!(grid.cell(0, 0).unwrap().c, 'A');
        assert_eq!(grid.cell(0, 1).unwrap().c, 'B');
        assert!(grid.is_row_dirty(0));

        grid.line_feed();
        grid.write_char('C', &cell);
        assert_eq!(grid.cursor().row, 1);

        grid.line_feed(); // Triggers scroll
        assert_eq!(grid.scrollback_len(), 1);
    }

    #[test]
    fn test_ansi_parser_truecolor() {
        let mut grid = TerminalGrid::new(24, 80, 100);
        let mut parser = AnsiParser::new();

        let input = b"\x1b[38;2;255;100;50mHello\x1b[0m";
        let _events = parser.process_bytes(&mut grid, input);

        let cell = grid.cell(0, 0).unwrap();
        assert_eq!(cell.c, 'H');
        assert_eq!(cell.fg, Color::Rgb(255, 100, 50));
    }

    #[test]
    fn test_osc_semantic_133_and_7() {
        let mut grid = TerminalGrid::new(24, 80, 100);
        let mut parser = AnsiParser::new();

        let input = b"\x1b]133;A\x07\x1b]7;file://localhost/Users/dev/project\x07\x1b]133;D;0\x07";
        let events = parser.process_bytes(&mut grid, input);

        assert_eq!(events.len(), 3);
        assert_eq!(events[0], OscEvent::ShellPromptStart(ShellPromptKind::Initial));
        assert_eq!(
            events[1],
            OscEvent::CurrentWorkingDirectory {
                hostname: None,
                path: "/Users/dev/project".to_string(),
            }
        );
        assert_eq!(events[2], OscEvent::ShellCommandFinished { exit_code: 0 });
    }

    #[test]
    fn test_osc_complete_suite_bel_and_st() {
        let mut grid = TerminalGrid::new(24, 80, 100);
        let mut parser = AnsiParser::new();

        // 1. OSC 2 Window Title with UTF-8 emoji and BEL
        let input1 = "echo \x1b]2;🧪 Test de Titre\x07".as_bytes();
        let events1 = parser.process_bytes(&mut grid, input1);
        assert_eq!(
            events1,
            vec![OscEvent::SetWindowTitle("🧪 Test de Titre".to_string())]
        );

        // 2. OSC 8 Hyperlink with ST terminator (\x1b\\)
        let input2 = b"\x1b]8;;https://github.com\x1b\\Lien\x1b]8;;\x1b\\";
        let events2 = parser.process_bytes(&mut grid, input2);
        assert_eq!(
            events2,
            vec![
                OscEvent::Hyperlink {
                    id: None,
                    uri: Some("https://github.com".to_string()),
                },
                OscEvent::Hyperlink { id: None, uri: None }
            ]
        );

        // 3. OSC 52 Clipboard
        let input3 = b"\x1b]52;c;SGVsbG8gV29ybGQ=\x07";
        let events3 = parser.process_bytes(&mut grid, input3);
        assert_eq!(
            events3,
            vec![OscEvent::ClipboardSet {
                target: "c".to_string(),
                content: "Hello World".to_string(),
            }]
        );

        // 4. OSC 11/12 Dynamic colors and resets
        let input4 = b"\x1b]11;#2e1065\x07\x1b]12;#facc15\x07\x1b]111\x07\x1b]112\x07";
        let events4 = parser.process_bytes(&mut grid, input4);
        assert_eq!(
            events4,
            vec![
                OscEvent::SetBackgroundColor("#2e1065".to_string()),
                OscEvent::SetCursorColor("#facc15".to_string()),
                OscEvent::ResetBackgroundColor,
                OscEvent::ResetCursorColor,
            ]
        );

        // 5. OSC 9 & OSC 777 Notifications
        let input5 = b"\x1b]9;T\xc3\xa2che termin\xc3\xa9e\x1b\\\x1b]777;notify;Termin\xc3\xa9;Fini\x1b\\";
        let events5 = parser.process_bytes(&mut grid, input5);
        assert_eq!(
            events5,
            vec![
                OscEvent::Notification {
                    title: None,
                    body: "Tâche terminée".to_string(),
                },
                OscEvent::Notification {
                    title: Some("Terminé".to_string()),
                    body: "Fini".to_string(),
                }
            ]
        );

        // 6. OSC 1337 iTerm2 Action
        let input6 = b"\x1b]1337;File=inline=1;width=4:AAAA\x07";
        let events6 = parser.process_bytes(&mut grid, input6);
        assert_eq!(
            events6,
            vec![OscEvent::ITerm2Action {
                name: "File".to_string(),
                args: "inline=1;width=4:AAAA".to_string(),
            }]
        );
    }

    #[test]
    fn test_kitty_keyboard_protocol() {
        let mut proto = KittyKeyboardProtocol::new();
        // Default legacy
        let legacy = proto.encode_key(&keyboard::Key::Enter, Modifiers::empty(), KeyEventType::KeyDown);
        assert_eq!(legacy, vec![b'\r']);

        // Enable kitty protocol flags
        proto.push_flags(KittyKeyboardFlags::DISAMBIGUATE_ESCAPE_CODES | KittyKeyboardFlags::REPORT_EVENT_TYPES);
        let enhanced = proto.encode_key(&keyboard::Key::Enter, Modifiers::empty(), KeyEventType::KeyDown);
        assert_eq!(enhanced, b"\x1b[13;1:1u".to_vec());
    }
}
