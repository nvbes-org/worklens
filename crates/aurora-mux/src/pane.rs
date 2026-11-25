use crate::layout::{LayoutCalculator, LayoutType, Rect};
use aurora_core::PtySize;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pane {
    pub id: String,
    pub title: String,
    pub size: PtySize,
    pub cwd: String,
    pub is_canvas: bool,
    pub bounds: Rect,
}

impl Pane {
    pub fn new(title: String, cwd: String) -> Self {
        Self {
            id: format!("pane_{}", Uuid::new_v4().simple()),
            title,
            size: PtySize::default(),
            cwd,
            is_canvas: false,
            bounds: Rect::new(0.0, 0.0, 800.0, 600.0),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tab {
    pub id: String,
    pub title: String,
    pub panes: Vec<Pane>,
    pub active_pane_index: usize,
    pub layout: LayoutType,
    pub previous_layout: Option<LayoutType>,
}

impl Tab {
    pub fn new(title: String) -> Self {
        Self {
            id: format!("tab_{}", Uuid::new_v4().simple()),
            title,
            panes: Vec::new(),
            active_pane_index: 0,
            layout: LayoutType::default(),
            previous_layout: None,
        }
    }

    pub fn add_pane(&mut self, pane: Pane, bounds: &Rect) {
        self.panes.push(pane);
        self.recalculate_layout(bounds);
        self.active_pane_index = self.panes.len() - 1;
    }

    pub fn close_pane(&mut self, index: usize, bounds: &Rect) -> Option<Pane> {
        if index < self.panes.len() {
            let removed = self.panes.remove(index);
            if self.active_pane_index >= self.panes.len() && !self.panes.is_empty() {
                self.active_pane_index = self.panes.len() - 1;
            }
            self.recalculate_layout(bounds);
            Some(removed)
        } else {
            None
        }
    }

    pub fn toggle_zoom(&mut self, bounds: &Rect) {
        if self.layout == LayoutType::Stack {
            self.layout = self.previous_layout.take().unwrap_or(LayoutType::Splits);
        } else {
            self.previous_layout = Some(self.layout);
            self.layout = LayoutType::Stack;
        }
        self.recalculate_layout(bounds);
    }

    pub fn recalculate_layout(&mut self, bounds: &Rect) {
        let rects = LayoutCalculator::calculate(
            self.layout,
            bounds,
            self.panes.len(),
            self.active_pane_index,
        );
        for (i, rect) in rects.into_iter().enumerate() {
            if let Some(pane) = self.panes.get_mut(i) {
                pane.bounds = rect;
            }
        }
    }

    pub fn active_pane(&self) -> Option<&Pane> {
        self.panes.get(self.active_pane_index)
    }

    pub fn active_pane_mut(&mut self) -> Option<&mut Pane> {
        self.panes.get_mut(self.active_pane_index)
    }
}
