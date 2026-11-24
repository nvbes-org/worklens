use bitflags::bitflags;

bitflags! {
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
    pub struct KittyKeyboardFlags: u32 {
        const DISAMBIGUATE_ESCAPE_CODES = 1 << 0;
        const REPORT_EVENT_TYPES = 1 << 1;
        const REPORT_ALTERNATE_KEYS = 1 << 2;
        const REPORT_ALL_KEYS_AS_ESC_CODES = 1 << 3;
        const REPORT_ASSOCIATED_TEXT = 1 << 4;
    }
}

bitflags! {
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
    pub struct Modifiers: u32 {
        const SHIFT = 1;
        const ALT = 2;
        const CTRL = 4;
        const SUPER = 8;
        const HYPER = 16;
        const META = 32;
        const CAPS_LOCK = 64;
        const NUM_LOCK = 128;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyEventType {
    KeyDown = 1,
    Repeat = 2,
    KeyUp = 3,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Key {
    Char(char),
    Enter,
    Tab,
    Backspace,
    Escape,
    Insert,
    Delete,
    Left,
    Right,
    Up,
    Down,
    PageUp,
    PageDown,
    Home,
    End,
    F(u8),
}

pub struct KittyKeyboardProtocol {
    stack: Vec<KittyKeyboardFlags>,
}

impl Default for KittyKeyboardProtocol {
    fn default() -> Self {
        Self {
            stack: vec![KittyKeyboardFlags::empty()],
        }
    }
}

impl KittyKeyboardProtocol {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn current_flags(&self) -> KittyKeyboardFlags {
        *self.stack.last().unwrap_or(&KittyKeyboardFlags::empty())
    }

    pub fn push_flags(&mut self, flags: KittyKeyboardFlags) {
        self.stack.push(flags);
    }

    pub fn pop_flags(&mut self, count: usize) {
        for _ in 0..count {
            if self.stack.len() > 1 {
                self.stack.pop();
            }
        }
    }

    pub fn set_flags(&mut self, flags: KittyKeyboardFlags) {
        if let Some(last) = self.stack.last_mut() {
            *last = flags;
        }
    }

    pub fn encode_key(&self, key: &Key, mods: Modifiers, event_type: KeyEventType) -> Vec<u8> {
        let flags = self.current_flags();

        // If no kitty protocol flags are active, fall back to legacy VT
        if flags.is_empty() {
            return self.encode_legacy(key, mods);
        }

        let key_code = match key {
            Key::Char(c) => *c as u32,
            Key::Enter => 13,
            Key::Tab => 9,
            Key::Backspace => 127,
            Key::Escape => 27,
            Key::Insert => 57358,
            Key::Delete => 57359,
            Key::Left => 57376,
            Key::Right => 57377,
            Key::Up => 57378,
            Key::Down => 57379,
            Key::PageUp => 57380,
            Key::PageDown => 57381,
            Key::Home => 57382,
            Key::End => 57383,
            Key::F(n) => 57384 + (*n as u32),
        };

        let mod_val = 1 + mods.bits();
        let ev_str = if flags.contains(KittyKeyboardFlags::REPORT_EVENT_TYPES) {
            format!(":{}", event_type as u8)
        } else {
            String::new()
        };

        format!("\x1b[{key_code};{mod_val}{ev_str}u").into_bytes()
    }

    fn encode_legacy(&self, key: &Key, mods: Modifiers) -> Vec<u8> {
        match key {
            Key::Char(c) => {
                if mods.contains(Modifiers::CTRL) && c.is_ascii_alphabetic() {
                    let code = (c.to_ascii_uppercase() as u8) - b'A' + 1;
                    vec![code]
                } else if mods.contains(Modifiers::ALT) {
                    let mut bytes = vec![0x1b];
                    let mut buf = [0u8; 4];
                    bytes.extend_from_slice(c.encode_utf8(&mut buf).as_bytes());
                    bytes
                } else {
                    let mut buf = [0u8; 4];
                    c.encode_utf8(&mut buf).as_bytes().to_vec()
                }
            }
            Key::Enter => vec![b'\r'],
            Key::Tab => vec![b'\t'],
            Key::Backspace => vec![0x7f],
            Key::Escape => vec![0x1b],
            Key::Up => vec![0x1b, b'[', b'A'],
            Key::Down => vec![0x1b, b'[', b'B'],
            Key::Right => vec![0x1b, b'[', b'C'],
            Key::Left => vec![0x1b, b'[', b'D'],
            Key::Home => vec![0x1b, b'[', b'H'],
            Key::End => vec![0x1b, b'[', b'F'],
            Key::PageUp => vec![0x1b, b'[', b'5', b'~'],
            Key::PageDown => vec![0x1b, b'[', b'6', b'~'],
            Key::Insert => vec![0x1b, b'[', b'2', b'~'],
            Key::Delete => vec![0x1b, b'[', b'3', b'~'],
            Key::F(n) => match n {
                1..=4 => vec![0x1b, b'O', b'P' + (n - 1)],
                5 => vec![0x1b, b'[', b'1', b'5', b'~'],
                6 => vec![0x1b, b'[', b'1', b'7', b'~'],
                7 => vec![0x1b, b'[', b'1', b'8', b'~'],
                8 => vec![0x1b, b'[', b'1', b'9', b'~'],
                9 => vec![0x1b, b'[', b'2', b'0', b'~'],
                10 => vec![0x1b, b'[', b'2', b'1', b'~'],
                11 => vec![0x1b, b'[', b'2', b'3', b'~'],
                12 => vec![0x1b, b'[', b'2', b'4', b'~'],
                _ => vec![],
            },
        }
    }
}
