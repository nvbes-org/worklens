pub mod data_table;
pub mod hex_view;
pub mod webview;
pub mod widget;

pub use data_table::{DataTable, TableColumn};
pub use hex_view::{HexLine, HexViewer};
pub use webview::{HeadingItem, MarkdownState, WebviewState};
pub use widget::{CanvasPane, CanvasWidgetKind};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_csv_data_table() {
        let csv_data = "name,stars,language\nworklens,120,Rust\naurora,450,Rust\nother,30,TypeScript";
        let table = DataTable::parse_csv(csv_data, ',');

        assert_eq!(table.columns.len(), 3);
        assert_eq!(table.columns[0].name, "name");
        assert_eq!(table.columns[1].name, "stars");
        assert!(table.columns[1].is_numeric);

        // Filter and sort by stars descending
        let sorted = table.filter_and_sort(Some("Rust"), Some(1), false);
        assert_eq!(sorted.len(), 2);
        assert_eq!(sorted[0][0], "aurora");
        assert_eq!(sorted[1][0], "worklens");
    }

    #[test]
    fn test_hex_viewer() {
        let bytes = b"AuroraTerm 120Hz";
        let lines = HexViewer::format_bytes(bytes, 16);
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].offset, 0);
        assert!(lines[0].hex_bytes.starts_with("41 75 72 6f"));
        assert_eq!(lines[0].ascii, "AuroraTerm 120Hz");
    }

    #[test]
    fn test_markdown_and_webview_canvas() {
        let md = "# Title\n## Section\nContent here";
        let canvas = CanvasPane::new_markdown("Doc".to_string(), md);
        match &canvas.widget {
            CanvasWidgetKind::Markdown(state) => {
                assert_eq!(state.outline.len(), 2);
                assert_eq!(state.outline[0].title, "Title");
                assert_eq!(state.outline[1].title, "Section");
                assert!(state.html.contains("<h1>Title</h1>"));
            }
            _ => panic!("Expected markdown widget"),
        }

        let web = CanvasPane::new_webview("Local".to_string(), "http://localhost:8080".to_string());
        match &web.widget {
            CanvasWidgetKind::Webview(state) => {
                assert_eq!(state.url, "http://localhost:8080");
            }
            _ => panic!("Expected webview widget"),
        }
    }
}
