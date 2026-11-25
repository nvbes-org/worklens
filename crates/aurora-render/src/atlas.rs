use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GlyphUv {
    pub u0: f32,
    pub v0: f32,
    pub u1: f32,
    pub v1: f32,
    pub width: u32,
    pub height: u32,
    pub offset_x: f32,
    pub offset_y: f32,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct GlyphKey {
    pub c: char,
    pub font_size: u32,
    pub bold: bool,
    pub italic: bool,
}

pub struct GlyphAtlas {
    width: u32,
    height: u32,
    cursor_x: u32,
    cursor_y: u32,
    row_height: u32,
    entries: HashMap<GlyphKey, GlyphUv>,
}

impl GlyphAtlas {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            cursor_x: 0,
            cursor_y: 0,
            row_height: 0,
            entries: HashMap::new(),
        }
    }

    pub fn get(&self, key: &GlyphKey) -> Option<&GlyphUv> {
        self.entries.get(key)
    }

    pub fn allocate(&mut self, key: GlyphKey, glyph_w: u32, glyph_h: u32) -> Option<GlyphUv> {
        if let Some(existing) = self.entries.get(&key) {
            return Some(*existing);
        }

        // Add 1px padding
        let padded_w = glyph_w + 2;
        let padded_h = glyph_h + 2;

        if self.cursor_x + padded_w > self.width {
            self.cursor_x = 0;
            self.cursor_y += self.row_height;
            self.row_height = 0;
        }

        if self.cursor_y + padded_h > self.height {
            // Atlas full
            return None;
        }

        let u0 = (self.cursor_x + 1) as f32 / self.width as f32;
        let v0 = (self.cursor_y + 1) as f32 / self.height as f32;
        let u1 = (self.cursor_x + 1 + glyph_w) as f32 / self.width as f32;
        let v1 = (self.cursor_y + 1 + glyph_h) as f32 / self.height as f32;

        let uv = GlyphUv {
            u0,
            v0,
            u1,
            v1,
            width: glyph_w,
            height: glyph_h,
            offset_x: 0.0,
            offset_y: 0.0,
        };

        self.cursor_x += padded_w;
        self.row_height = self.row_height.max(padded_h);
        self.entries.insert(key, uv);

        Some(uv)
    }

    pub fn clear(&mut self) {
        self.cursor_x = 0;
        self.cursor_y = 0;
        self.row_height = 0;
        self.entries.clear();
    }
}
