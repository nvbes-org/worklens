use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebviewState {
    pub url: String,
    pub title: String,
    pub is_loading: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    pub devtools_open: bool,
}

impl Default for WebviewState {
    fn default() -> Self {
        Self {
            url: "http://localhost:3000".to_string(),
            title: "Local Server".to_string(),
            is_loading: false,
            can_go_back: false,
            can_go_forward: false,
            devtools_open: false,
        }
    }
}

impl WebviewState {
    pub fn new(url: String) -> Self {
        Self {
            url,
            ..Default::default()
        }
    }

    pub fn navigate(&mut self, url: String) {
        self.url = url;
        self.is_loading = true;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeadingItem {
    pub level: usize,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarkdownState {
    pub source: String,
    pub html: String,
    pub outline: Vec<HeadingItem>,
}

impl MarkdownState {
    pub fn from_source(source: &str) -> Self {
        let mut outline = Vec::new();
        let mut html = String::new();

        for line in source.lines() {
            if let Some(rest) = line.strip_prefix("### ") {
                outline.push(HeadingItem {
                    level: 3,
                    title: rest.to_string(),
                });
                html.push_str(&format!("<h3>{rest}</h3>\n"));
            } else if let Some(rest) = line.strip_prefix("## ") {
                outline.push(HeadingItem {
                    level: 2,
                    title: rest.to_string(),
                });
                html.push_str(&format!("<h2>{rest}</h2>\n"));
            } else if let Some(rest) = line.strip_prefix("# ") {
                outline.push(HeadingItem {
                    level: 1,
                    title: rest.to_string(),
                });
                html.push_str(&format!("<h1>{rest}</h1>\n"));
            } else {
                html.push_str(&format!("<p>{line}</p>\n"));
            }
        }

        Self {
            source: source.to_string(),
            html,
            outline,
        }
    }
}
