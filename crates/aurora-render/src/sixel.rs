use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct SixelImage {
    pub width: usize,
    pub height: usize,
    pub rgba_data: Vec<u8>,
}

pub struct SixelDecoder;

impl SixelDecoder {
    pub fn decode(payload: &str) -> Option<SixelImage> {
        let mut palette: HashMap<u8, [u8; 4]> = HashMap::new();
        // Default color 0 is black, 1 is white
        palette.insert(0, [0, 0, 0, 255]);
        palette.insert(1, [255, 255, 255, 255]);

        let mut current_color = [255, 255, 255, 255];
        let mut x = 0;
        let mut y = 0;
        let mut max_x = 0;
        let mut max_y = 0;

        let mut pixels: HashMap<(usize, usize), [u8; 4]> = HashMap::new();

        let bytes = payload.as_bytes();
        let mut i = 0;

        while i < bytes.len() {
            let b = bytes[i];
            match b {
                b'#' => {
                    // Color selection or definition
                    i += 1;
                    let mut num_str = String::new();
                    while i < bytes.len() && bytes[i].is_ascii_digit() {
                        num_str.push(bytes[i] as char);
                        i += 1;
                    }
                    if let Ok(reg) = num_str.parse::<u8>() {
                        if i < bytes.len() && bytes[i] == b';' {
                            // Define color: #reg;2;r;g;b
                            i += 1;
                            let mut def_parts = Vec::new();
                            let mut cur = String::new();
                            while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b';') {
                                if bytes[i] == b';' {
                                    def_parts.push(cur.clone());
                                    cur.clear();
                                } else {
                                    cur.push(bytes[i] as char);
                                }
                                i += 1;
                            }
                            def_parts.push(cur);

                            if def_parts.len() >= 4 && def_parts[0] == "2" {
                                let r = (def_parts[1].parse::<u32>().unwrap_or(0) * 255 / 100) as u8;
                                let g = (def_parts[2].parse::<u32>().unwrap_or(0) * 255 / 100) as u8;
                                let b = (def_parts[3].parse::<u32>().unwrap_or(0) * 255 / 100) as u8;
                                palette.insert(reg, [r, g, b, 255]);
                            }
                        } else if let Some(&c) = palette.get(&reg) {
                            current_color = c;
                        }
                    }
                    continue;
                }
                b'$' => {
                    // Carriage return
                    x = 0;
                }
                b'-' => {
                    // Line feed (move down 6 pixels)
                    x = 0;
                    y += 6;
                }
                0x3F..=0x7E => {
                    // 6-bit vertical slice
                    let bits = b - 0x3F;
                    for bit_idx in 0..6 {
                        if (bits & (1 << bit_idx)) != 0 {
                            let py = y + bit_idx;
                            pixels.insert((x, py), current_color);
                            max_x = max_x.max(x + 1);
                            max_y = max_y.max(py + 1);
                        }
                    }
                    x += 1;
                }
                _ => {}
            }
            i += 1;
        }

        if max_x == 0 || max_y == 0 {
            return None;
        }

        let mut rgba_data = vec![0u8; max_x * max_y * 4];
        for (&(px, py), color) in &pixels {
            let offset = (py * max_x + px) * 4;
            if offset + 4 <= rgba_data.len() {
                rgba_data[offset..offset + 4].copy_from_slice(color);
            }
        }

        Some(SixelImage {
            width: max_x,
            height: max_y,
            rgba_data,
        })
    }
}

pub struct ITerm2Image;

impl ITerm2Image {
    pub fn parse(payload: &str) -> Option<(String, Vec<u8>)> {
        let (params, b64_data) = payload.split_once(':')?;
        let mut filename = "inline_image".to_string();

        for param in params.split(';') {
            if let Some((k, v)) = param.split_once('=') {
                if k == "name" {
                    if let Ok(decoded) = BASE64.decode(v.as_bytes()) {
                        filename = String::from_utf8_lossy(&decoded).to_string();
                    }
                }
            }
        }

        let data = BASE64.decode(b64_data.trim().as_bytes()).ok()?;
        Some((filename, data))
    }
}
