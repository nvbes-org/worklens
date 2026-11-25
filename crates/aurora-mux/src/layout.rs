use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum LayoutType {
    #[default]
    Splits,
    Fat,
    Tall,
    Grid,
    Stack,
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SplitDirection {
    Horizontal,
    Vertical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

impl Rect {
    pub fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self { x, y, width, height }
    }
}

pub struct LayoutCalculator;

impl LayoutCalculator {
    pub fn calculate(layout: LayoutType, bounds: &Rect, pane_count: usize, _active_index: usize) -> Vec<Rect> {
        if pane_count == 0 {
            return Vec::new();
        }
        if pane_count == 1 || layout == LayoutType::Stack {
            return vec![bounds.clone(); pane_count];
        }

        match layout {
            LayoutType::Vertical => {
                let col_w = bounds.width / pane_count as f32;
                (0..pane_count)
                    .map(|i| Rect::new(bounds.x + i as f32 * col_w, bounds.y, col_w, bounds.height))
                    .collect()
            }
            LayoutType::Horizontal => {
                let row_h = bounds.height / pane_count as f32;
                (0..pane_count)
                    .map(|i| Rect::new(bounds.x, bounds.y + i as f32 * row_h, bounds.width, row_h))
                    .collect()
            }
            LayoutType::Tall => {
                // Main pane 70% width on left, remainder split vertically on right
                let main_w = bounds.width * 0.7;
                let secondary_w = bounds.width * 0.3;
                let sec_count = pane_count - 1;
                let sec_h = bounds.height / sec_count as f32;

                let mut rects = vec![Rect::new(bounds.x, bounds.y, main_w, bounds.height)];
                for i in 0..sec_count {
                    rects.push(Rect::new(
                        bounds.x + main_w,
                        bounds.y + i as f32 * sec_h,
                        secondary_w,
                        sec_h,
                    ));
                }
                rects
            }
            LayoutType::Fat => {
                // Main pane 70% height on top, remainder split horizontally on bottom
                let main_h = bounds.height * 0.7;
                let secondary_h = bounds.height * 0.3;
                let sec_count = pane_count - 1;
                let sec_w = bounds.width / sec_count as f32;

                let mut rects = vec![Rect::new(bounds.x, bounds.y, bounds.width, main_h)];
                for i in 0..sec_count {
                    rects.push(Rect::new(
                        bounds.x + i as f32 * sec_w,
                        bounds.y + main_h,
                        sec_w,
                        secondary_h,
                    ));
                }
                rects
            }
            LayoutType::Grid => {
                let cols = (pane_count as f32).sqrt().ceil() as usize;
                let rows = (pane_count as f32 / cols as f32).ceil() as usize;
                let cell_w = bounds.width / cols as f32;
                let cell_h = bounds.height / rows as f32;

                let mut rects = Vec::with_capacity(pane_count);
                for i in 0..pane_count {
                    let r = i / cols;
                    let c = i % cols;
                    rects.push(Rect::new(
                        bounds.x + c as f32 * cell_w,
                        bounds.y + r as f32 * cell_h,
                        cell_w,
                        cell_h,
                    ));
                }
                rects
            }
            LayoutType::Splits => {
                // Default fallback to Vertical if not computing arbitrary tree
                Self::calculate(LayoutType::Vertical, bounds, pane_count, _active_index)
            }
            LayoutType::Stack => unreachable!(),
        }
    }
}
