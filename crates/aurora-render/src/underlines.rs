use aurora_core::UnderlineStyle;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LineSegment {
    pub x0: f32,
    pub y0: f32,
    pub x1: f32,
    pub y1: f32,
    pub thickness: f32,
}

pub struct UnderlineRenderer;

impl UnderlineRenderer {
    pub fn generate_segments(
        style: UnderlineStyle,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    ) -> Vec<LineSegment> {
        let baseline = y + height - 2.0;
        let mut segments = Vec::new();

        match style {
            UnderlineStyle::None => {}
            UnderlineStyle::Straight => {
                segments.push(LineSegment {
                    x0: x,
                    y0: baseline,
                    x1: x + width,
                    y1: baseline,
                    thickness: 1.5,
                });
            }
            UnderlineStyle::Double => {
                segments.push(LineSegment {
                    x0: x,
                    y0: baseline - 1.5,
                    x1: x + width,
                    y1: baseline - 1.5,
                    thickness: 1.0,
                });
                segments.push(LineSegment {
                    x0: x,
                    y0: baseline + 1.0,
                    x1: x + width,
                    y1: baseline + 1.0,
                    thickness: 1.0,
                });
            }
            UnderlineStyle::Curly => {
                // Approximate curly sine wave with 4 segments per cell
                let steps = 6;
                let _step_w = width / steps as f32;
                let amplitude = 1.8;
                for i in 0..steps {
                    let t0 = i as f32 / steps as f32;
                    let t1 = (i + 1) as f32 / steps as f32;
                    let sx0 = x + t0 * width;
                    let sx1 = x + t1 * width;
                    let sy0 = baseline + (t0 * std::f32::consts::TAU).sin() * amplitude;
                    let sy1 = baseline + (t1 * std::f32::consts::TAU).sin() * amplitude;
                    segments.push(LineSegment {
                        x0: sx0,
                        y0: sy0,
                        x1: sx1,
                        y1: sy1,
                        thickness: 1.2,
                    });
                }
            }
            UnderlineStyle::Dotted => {
                let dot_spacing = 4.0;
                let mut cur_x = x;
                while cur_x < x + width {
                    segments.push(LineSegment {
                        x0: cur_x,
                        y0: baseline,
                        x1: (cur_x + 1.5).min(x + width),
                        y1: baseline,
                        thickness: 1.5,
                    });
                    cur_x += dot_spacing;
                }
            }
            UnderlineStyle::Dashed => {
                let dash_len = 5.0;
                let gap_len = 3.0;
                let mut cur_x = x;
                while cur_x < x + width {
                    let end_x = (cur_x + dash_len).min(x + width);
                    segments.push(LineSegment {
                        x0: cur_x,
                        y0: baseline,
                        x1: end_x,
                        y1: baseline,
                        thickness: 1.5,
                    });
                    cur_x += dash_len + gap_len;
                }
            }
        }

        segments
    }
}
