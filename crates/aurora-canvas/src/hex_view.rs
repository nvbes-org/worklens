use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HexLine {
    pub offset: usize,
    pub hex_bytes: String,
    pub ascii: String,
}

pub struct HexViewer;

impl HexViewer {
    pub fn format_bytes(bytes: &[u8], bytes_per_line: usize) -> Vec<HexLine> {
        let bpl = if bytes_per_line == 0 { 16 } else { bytes_per_line };
        let mut lines = Vec::new();

        for (chunk_idx, chunk) in bytes.chunks(bpl).enumerate() {
            let offset = chunk_idx * bpl;

            let mut hex_parts = Vec::new();
            let mut ascii_chars = String::new();

            for (i, &b) in chunk.iter().enumerate() {
                hex_parts.push(format!("{b:02x}"));
                if i == 7 && chunk.len() > 8 {
                    hex_parts.push(" ".to_string());
                }
                if b >= 0x20 && b <= 0x7E {
                    ascii_chars.push(b as char);
                } else {
                    ascii_chars.push('.');
                }
            }

            // Pad remaining columns if last line is short
            while hex_parts.len() < bpl + if bpl > 8 { 1 } else { 0 } {
                hex_parts.push("  ".to_string());
            }

            lines.push(HexLine {
                offset,
                hex_bytes: hex_parts.join(" "),
                ascii: ascii_chars,
            });
        }

        lines
    }
}
