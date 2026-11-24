use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KittyAction {
    Transmit,
    TransmitAndDisplay,
    Put,
    Delete,
    Query,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KittyFormat {
    Rgb24,
    Rgba32,
    Png,
}

#[derive(Debug, Clone)]
pub struct KittyImageCommand {
    pub action: KittyAction,
    pub format: KittyFormat,
    pub width: u32,
    pub height: u32,
    pub image_id: Option<u32>,
    pub more_chunks: bool,
    pub cols: Option<u32>,
    pub rows: Option<u32>,
    pub z_index: i32,
    pub data: Vec<u8>,
}

pub struct KittyGraphicsDecoder {
    pending_chunks: HashMap<u32, Vec<u8>>,
}

impl Default for KittyGraphicsDecoder {
    fn default() -> Self {
        Self {
            pending_chunks: HashMap::new(),
        }
    }
}

impl KittyGraphicsDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn parse_command(payload: &str) -> Option<KittyImageCommand> {
        let (controls, b64_data) = match payload.split_once(';') {
            Some((c, d)) => (c, d),
            None => (payload, ""),
        };

        let mut action = KittyAction::TransmitAndDisplay;
        let mut format = KittyFormat::Rgba32;
        let mut width = 0;
        let mut height = 0;
        let mut image_id = None;
        let mut more_chunks = false;
        let mut cols = None;
        let mut rows = None;
        let mut z_index = 0;

        for part in controls.split(',') {
            if let Some((k, v)) = part.split_once('=') {
                match k {
                    "a" => match v {
                        "t" => action = KittyAction::Transmit,
                        "T" => action = KittyAction::TransmitAndDisplay,
                        "p" => action = KittyAction::Put,
                        "d" => action = KittyAction::Delete,
                        "q" => action = KittyAction::Query,
                        _ => {}
                    },
                    "f" => match v {
                        "24" => format = KittyFormat::Rgb24,
                        "32" => format = KittyFormat::Rgba32,
                        "100" => format = KittyFormat::Png,
                        _ => {}
                    },
                    "s" => width = v.parse::<u32>().unwrap_or(0),
                    "v" => height = v.parse::<u32>().unwrap_or(0),
                    "i" => image_id = v.parse::<u32>().ok(),
                    "m" => more_chunks = v == "1",
                    "c" => cols = v.parse::<u32>().ok(),
                    "r" => rows = v.parse::<u32>().ok(),
                    "z" => z_index = v.parse::<i32>().unwrap_or(0),
                    _ => {}
                }
            }
        }

        let decoded_data = if !b64_data.is_empty() {
            BASE64.decode(b64_data.trim().as_bytes()).unwrap_or_default()
        } else {
            Vec::new()
        };

        Some(KittyImageCommand {
            action,
            format,
            width,
            height,
            image_id,
            more_chunks,
            cols,
            rows,
            z_index,
            data: decoded_data,
        })
    }

    pub fn assemble_chunk(&mut self, cmd: &KittyImageCommand) -> Option<Vec<u8>> {
        let id = cmd.image_id.unwrap_or(0);
        let entry = self.pending_chunks.entry(id).or_default();
        entry.extend_from_slice(&cmd.data);

        if !cmd.more_chunks {
            self.pending_chunks.remove(&id)
        } else {
            None
        }
    }
}
