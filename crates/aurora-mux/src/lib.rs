pub mod layout;
pub mod pane;
pub mod workspace;

pub use layout::{LayoutCalculator, LayoutType, Rect, SplitDirection};
pub use pane::{Pane, Tab};
pub use workspace::{Window, Workspace};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tall_and_fat_layouts() {
        let bounds = Rect::new(0.0, 0.0, 1000.0, 500.0);

        // Tall layout: 3 panes
        let tall_rects = LayoutCalculator::calculate(LayoutType::Tall, &bounds, 3, 0);
        assert_eq!(tall_rects.len(), 3);
        // Main pane is 70% width = 700.0
        assert_eq!(tall_rects[0].width, 700.0);
        assert_eq!(tall_rects[0].height, 500.0);
        // Secondary panes are 30% width = 300.0, height = 250.0
        assert_eq!(tall_rects[1].width, 300.0);
        assert_eq!(tall_rects[1].height, 250.0);
        assert_eq!(tall_rects[2].height, 250.0);

        // Fat layout: 3 panes
        let fat_rects = LayoutCalculator::calculate(LayoutType::Fat, &bounds, 3, 0);
        assert_eq!(fat_rects.len(), 3);
        // Main pane is 70% height = 350.0
        assert_eq!(fat_rects[0].width, 1000.0);
        assert_eq!(fat_rects[0].height, 350.0);
        // Secondary panes are 50% width = 500.0, height = 150.0
        assert_eq!(fat_rects[1].width, 500.0);
        assert_eq!(fat_rects[1].height, 150.0);
    }

    #[test]
    fn test_zoom_toggle() {
        let bounds = Rect::new(0.0, 0.0, 800.0, 600.0);
        let mut tab = Tab::new("Main".to_string());
        tab.layout = LayoutType::Tall;

        tab.add_pane(Pane::new("P1".to_string(), "/".to_string()), &bounds);
        tab.add_pane(Pane::new("P2".to_string(), "/".to_string()), &bounds);

        // Zoom (Stack mode)
        tab.toggle_zoom(&bounds);
        assert_eq!(tab.layout, LayoutType::Stack);
        assert_eq!(tab.panes[0].bounds.width, 800.0);
        assert_eq!(tab.panes[0].bounds.height, 600.0);

        // Unzoom (revert to Tall mode)
        tab.toggle_zoom(&bounds);
        assert_eq!(tab.layout, LayoutType::Tall);
        assert_eq!(tab.panes[0].bounds.width, 560.0); // 70% of 800
    }

    #[test]
    fn test_workspace_serialization() {
        let bounds = Rect::new(0.0, 0.0, 1200.0, 800.0);
        let mut ws = Workspace::new("Dev Workspace".to_string());
        let mut win = Window::new("Worklens".to_string(), bounds.clone());
        let mut tab = Tab::new("Code".to_string());
        tab.add_pane(Pane::new("Shell".to_string(), "/Users/shayn".to_string()), &bounds);
        win.add_tab(tab);
        ws.add_window(win);

        let json = ws.serialize_to_json().unwrap();
        let restored = Workspace::deserialize_from_json(&json).unwrap();
        assert_eq!(restored.name, "Dev Workspace");
        assert_eq!(restored.windows.len(), 1);
        assert_eq!(restored.windows[0].tabs.len(), 1);
        assert_eq!(restored.windows[0].tabs[0].panes.len(), 1);
    }
}
