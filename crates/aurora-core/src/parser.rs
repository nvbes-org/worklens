use crate::grid::{Cell, CellFlags, Color, TerminalGrid, UnderlineStyle};
use crate::osc::{OscEvent, OscParser};

pub struct AnsiParser {
    template: Cell,
    osc_buf: Vec<u8>,
    in_osc: bool,
    csi_buf: String,
    in_csi: bool,
    in_escape: bool,
}

impl Default for AnsiParser {
    fn default() -> Self {
        Self {
            template: Cell::default(),
            osc_buf: Vec::with_capacity(512),
            in_osc: false,
            csi_buf: String::with_capacity(64),
            in_csi: false,
            in_escape: false,
        }
    }
}

impl AnsiParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn process_bytes(&mut self, grid: &mut TerminalGrid, bytes: &[u8]) -> Vec<OscEvent> {
        let mut osc_events = Vec::new();
        let mut i = 0;

        while i < bytes.len() {
            let b = bytes[i];

            if self.in_osc {
                if b == 0x18 || b == 0x1A {
                    self.osc_buf.clear();
                    self.in_osc = false;
                    self.in_escape = false;
                } else if b == 0x07 || b == 0x9C || (b == b'\\' && self.in_escape) {
                    let payload = String::from_utf8_lossy(&self.osc_buf);
                    if let Ok(Some(ev)) = OscParser::parse(&payload) {
                        self.handle_osc_side_effects(&ev);
                        osc_events.push(ev);
                    }
                    self.osc_buf.clear();
                    self.in_osc = false;
                    self.in_escape = false;
                } else if b == 0x1b {
                    self.in_escape = true;
                } else {
                    if self.in_escape {
                        self.osc_buf.push(0x1b);
                        self.in_escape = false;
                    }
                    self.osc_buf.push(b);
                }
                i += 1;
                continue;
            }

            if self.in_csi {
                if (0x40..=0x7E).contains(&b) {
                    self.execute_csi(grid, b as char);
                    self.csi_buf.clear();
                    self.in_csi = false;
                } else {
                    self.csi_buf.push(b as char);
                }
                i += 1;
                continue;
            }

            if self.in_escape {
                match b {
                    b'[' => {
                        self.in_csi = true;
                        self.csi_buf.clear();
                    }
                    b']' => {
                        self.in_osc = true;
                        self.osc_buf.clear();
                    }
                    b'c' => grid.clear_screen(),
                    _ => {}
                }
                self.in_escape = false;
                i += 1;
                continue;
            }

            match b {
                0x1b => self.in_escape = true,
                b'\r' => grid.set_cursor(grid.cursor().row, 0),
                b'\n' => grid.line_feed(),
                b'\t' => {
                    let col = (grid.cursor().col / 8 + 1) * 8;
                    grid.set_cursor(grid.cursor().row, col);
                }
                0x08 => {
                    let col = grid.cursor().col.saturating_sub(1);
                    grid.set_cursor(grid.cursor().row, col);
                }
                _ => {
                    if b >= 0x20 {
                        // UTF-8 decode
                        if let Ok(s) = std::str::from_utf8(&bytes[i..]) {
                            if let Some(ch) = s.chars().next() {
                                grid.write_char(ch, &self.template);
                                i += ch.len_utf8();
                                continue;
                            }
                        }
                        grid.write_char(b as char, &self.template);
                    }
                }
            }
            i += 1;
        }

        osc_events
    }

    fn handle_osc_side_effects(&mut self, ev: &OscEvent) {
        match ev {
            OscEvent::SetForegroundColor(spec) => {
                if let Some(col) = Self::parse_color_spec(spec) {
                    self.template.fg = col;
                }
            }
            OscEvent::SetBackgroundColor(spec) => {
                if let Some(col) = Self::parse_color_spec(spec) {
                    self.template.bg = col;
                }
            }
            OscEvent::ResetForegroundColor => {
                self.template.fg = Color::Default;
            }
            OscEvent::ResetBackgroundColor => {
                self.template.bg = Color::Default;
            }
            _ => {}
        }
    }

    fn parse_color_spec(spec: &str) -> Option<Color> {
        let s = spec.trim();
        if let Some(hex) = s.strip_prefix('#') {
            if hex.len() == 6 {
                let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
                let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
                let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
                return Some(Color::Rgb(r, g, b));
            }
        } else if let Some(rgb) = s.strip_prefix("rgb:") {
            let parts: Vec<&str> = rgb.split('/').collect();
            if parts.len() == 3 {
                let r = u8::from_str_radix(parts[0].get(0..2).unwrap_or(parts[0]), 16).ok()?;
                let g = u8::from_str_radix(parts[1].get(0..2).unwrap_or(parts[1]), 16).ok()?;
                let b = u8::from_str_radix(parts[2].get(0..2).unwrap_or(parts[2]), 16).ok()?;
                return Some(Color::Rgb(r, g, b));
            }
        }
        None
    }

    fn execute_csi(&mut self, grid: &mut TerminalGrid, cmd: char) {
        match cmd {
            'm' => self.parse_sgr(),
            'A' => {
                let n = self.csi_param(0).unwrap_or(1).max(1);
                grid.set_cursor(grid.cursor().row.saturating_sub(n), grid.cursor().col);
            }
            'B' => {
                let n = self.csi_param(0).unwrap_or(1).max(1);
                grid.set_cursor(grid.cursor().row + n, grid.cursor().col);
            }
            'C' => {
                let n = self.csi_param(0).unwrap_or(1).max(1);
                grid.set_cursor(grid.cursor().row, grid.cursor().col + n);
            }
            'D' => {
                let n = self.csi_param(0).unwrap_or(1).max(1);
                grid.set_cursor(grid.cursor().row, grid.cursor().col.saturating_sub(n));
            }
            'H' | 'f' => {
                let r = self.csi_param(0).unwrap_or(1).saturating_sub(1);
                let c = self.csi_param(1).unwrap_or(1).saturating_sub(1);
                grid.set_cursor(r, c);
            }
            'J' => {
                let mode = self.csi_param(0).unwrap_or(0);
                if mode == 2 || mode == 3 {
                    grid.clear_screen();
                }
            }
            'K' => {
                let r = grid.cursor().row;
                grid.clear_line(r);
            }
            _ => {}
        }
    }

    fn parse_sgr(&mut self) {
        if self.csi_buf.is_empty() {
            self.template = Cell::default();
            return;
        }

        let parts: Vec<&str> = self.csi_buf.split(';').collect();
        let mut idx = 0;

        while idx < parts.len() {
            let part = parts[idx];
            let code = part.parse::<u16>().unwrap_or(0);

            match code {
                0 => self.template = Cell::default(),
                1 => self.template.flags.insert(CellFlags::BOLD),
                2 => self.template.flags.insert(CellFlags::DIM),
                3 => self.template.flags.insert(CellFlags::ITALIC),
                4 => {
                    self.template.underline_style = UnderlineStyle::Straight;
                }
                7 => self.template.flags.insert(CellFlags::INVERSE),
                9 => self.template.flags.insert(CellFlags::STRIKETHROUGH),
                22 => self.template.flags.remove(CellFlags::BOLD | CellFlags::DIM),
                23 => self.template.flags.remove(CellFlags::ITALIC),
                24 => self.template.underline_style = UnderlineStyle::None,
                27 => self.template.flags.remove(CellFlags::INVERSE),
                29 => self.template.flags.remove(CellFlags::STRIKETHROUGH),
                30..=37 => self.template.fg = Color::Indexed((code - 30) as u8),
                38 => {
                    if let Some((color, consumed)) = self.parse_extended_color(&parts[idx + 1..]) {
                        self.template.fg = color;
                        idx += consumed;
                    }
                }
                39 => self.template.fg = Color::Default,
                40..=47 => self.template.bg = Color::Indexed((code - 40) as u8),
                48 => {
                    if let Some((color, consumed)) = self.parse_extended_color(&parts[idx + 1..]) {
                        self.template.bg = color;
                        idx += consumed;
                    }
                }
                49 => self.template.bg = Color::Default,
                58 => {
                    if let Some((color, consumed)) = self.parse_extended_color(&parts[idx + 1..]) {
                        self.template.underline_color = Some(color);
                        idx += consumed;
                    }
                }
                59 => self.template.underline_color = None,
                90..=97 => self.template.fg = Color::Indexed((code - 90 + 8) as u8),
                100..=107 => self.template.bg = Color::Indexed((code - 100 + 8) as u8),
                _ => {}
            }
            idx += 1;
        }
    }

    fn parse_extended_color(&self, params: &[&str]) -> Option<(Color, usize)> {
        if params.is_empty() {
            return None;
        }
        match params[0] {
            "5" => {
                if params.len() > 1 {
                    let idx = params[1].parse::<u8>().ok()?;
                    Some((Color::Indexed(idx), 2))
                } else {
                    None
                }
            }
            "2" => {
                if params.len() > 3 {
                    let r = params[1].parse::<u8>().ok()?;
                    let g = params[2].parse::<u8>().ok()?;
                    let b = params[3].parse::<u8>().ok()?;
                    Some((Color::Rgb(r, g, b), 4))
                } else {
                    None
                }
            }
            _ => None,
        }
    }

    fn csi_param(&self, index: usize) -> Option<usize> {
        self.csi_buf
            .split(';')
            .nth(index)
            .and_then(|s| s.parse::<usize>().ok())
    }
}
