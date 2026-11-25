use crate::layout::Rect;
use crate::pane::Tab;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Window {
    pub id: String,
    pub title: String,
    pub tabs: Vec<Tab>,
    pub active_tab_index: usize,
    pub frame: Rect,
}

impl Window {
    pub fn new(title: String, frame: Rect) -> Self {
        Self {
            id: format!("win_{}", Uuid::new_v4().simple()),
            title,
            tabs: Vec::new(),
            active_tab_index: 0,
            frame,
        }
    }

    pub fn add_tab(&mut self, mut tab: Tab) {
        tab.recalculate_layout(&self.frame);
        self.tabs.push(tab);
        self.active_tab_index = self.tabs.len() - 1;
    }

    pub fn active_tab(&self) -> Option<&Tab> {
        self.tabs.get(self.active_tab_index)
    }

    pub fn active_tab_mut(&mut self) -> Option<&mut Tab> {
        self.tabs.get_mut(self.active_tab_index)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub windows: Vec<Window>,
    pub active_window_index: usize,
}

impl Workspace {
    pub fn new(name: String) -> Self {
        Self {
            id: format!("ws_{}", Uuid::new_v4().simple()),
            name,
            windows: Vec::new(),
            active_window_index: 0,
        }
    }

    pub fn add_window(&mut self, window: Window) {
        self.windows.push(window);
        self.active_window_index = self.windows.len() - 1;
    }

    pub fn active_window(&self) -> Option<&Window> {
        self.windows.get(self.active_window_index)
    }

    pub fn active_window_mut(&mut self) -> Option<&mut Window> {
        self.windows.get_mut(self.active_window_index)
    }

    pub fn serialize_to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    pub fn deserialize_from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}
