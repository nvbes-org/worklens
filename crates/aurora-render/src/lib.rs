pub mod atlas;
pub mod kitty_image;
pub mod shaders;
pub mod sixel;
pub mod underlines;

pub use atlas::{GlyphAtlas, GlyphKey, GlyphUv};
pub use kitty_image::{KittyAction, KittyFormat, KittyGraphicsDecoder, KittyImageCommand};
pub use shaders::{METAL_CRT_SHADER, METAL_TERMINAL_SHADER};
pub use sixel::{ITerm2Image, SixelDecoder, SixelImage};
pub use underlines::{LineSegment, UnderlineRenderer};

#[cfg(test)]
mod tests {
    use super::*;
    use aurora_core::UnderlineStyle;

    #[test]
    fn test_glyph_atlas_allocation() {
        let mut atlas = GlyphAtlas::new(128, 128);
        let key = GlyphKey {
            c: 'A',
            font_size: 14,
            bold: false,
            italic: false,
        };

        let uv = atlas.allocate(key.clone(), 10, 18).unwrap();
        assert!(uv.u1 > uv.u0);
        assert!(uv.v1 > uv.v0);
        assert_eq!(uv.width, 10);
        assert_eq!(uv.height, 18);

        // Same key retrieves cached UV
        let cached = atlas.get(&key).unwrap();
        assert_eq!(cached.u0, uv.u0);
    }

    #[test]
    fn test_underline_renderer_curly() {
        let segments = UnderlineRenderer::generate_segments(
            UnderlineStyle::Curly,
            10.0,
            20.0,
            8.0,
            16.0,
        );
        assert_eq!(segments.len(), 6);
        assert!(segments[0].x0 >= 10.0);
    }

    #[test]
    fn test_kitty_graphics_protocol() {
        let payload = "a=T,f=32,s=2,v=2,m=0;AQIDBAECAwQ=";
        let cmd = KittyGraphicsDecoder::parse_command(payload).unwrap();

        assert_eq!(cmd.action, KittyAction::TransmitAndDisplay);
        assert_eq!(cmd.format, KittyFormat::Rgba32);
        assert_eq!(cmd.width, 2);
        assert_eq!(cmd.height, 2);
        assert_eq!(cmd.data.len(), 8);
    }

    #[test]
    fn test_sixel_decoder() {
        // Simple Sixel payload: #1;2;100;100;100#1~~
        let payload = "#1;2;100;100;100#1~~";
        let image = SixelDecoder::decode(payload).unwrap();
        assert_eq!(image.width, 2);
        assert_eq!(image.height, 6);
        assert_eq!(image.rgba_data.len(), 2 * 6 * 4);
    }
}
