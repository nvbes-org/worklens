use crate::data_table::DataTable;
use crate::hex_view::HexLine;
use crate::webview::{MarkdownState, WebviewState};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum CanvasWidgetKind {
    Webview(WebviewState),
    Markdown(MarkdownState),
    DataTable(DataTable),
    Hex(Vec<HexLine>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasPane {
    pub id: String,
    pub title: String,
    pub widget: CanvasWidgetKind,
}

impl CanvasPane {
    pub fn new_webview(title: String, url: String) -> Self {
        Self {
            id: format!("canvas_{}", Uuid::new_v4().simple()),
            title,
            widget: CanvasWidgetKind::Webview(WebviewState::new(url)),
        }
    }

    pub fn new_markdown(title: String, source: &str) -> Self {
        Self {
            id: format!("canvas_{}", Uuid::new_v4().simple()),
            title,
            widget: CanvasWidgetKind::Markdown(MarkdownState::from_source(source)),
        }
    }

    pub fn new_data_table(title: String, csv: &str, delimiter: char) -> Self {
        Self {
            id: format!("canvas_{}", Uuid::new_v4().simple()),
            title,
            widget: CanvasWidgetKind::DataTable(DataTable::parse_csv(csv, delimiter)),
        }
    }

    pub fn new_hex(title: String, bytes: &[u8]) -> Self {
        Self {
            id: format!("canvas_{}", Uuid::new_v4().simple()),
            title,
            widget: CanvasWidgetKind::Hex(crate::hex_view::HexViewer::format_bytes(bytes, 16)),
        }
    }
}
