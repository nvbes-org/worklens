use bitflags::bitflags;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Color {
    Default,
    Indexed(u8),
    Rgb(u8, u8, u8),
}

impl Default for Color {
    fn default() -> Self {
        Self::Default
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum UnderlineStyle {
    #[default]
    None,
    Straight,
    Double,
    Curly,
    Dotted,
    Dashed,
}

bitflags! {
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
    pub struct CellFlags: u16 {
        const BOLD          = 1 << 0;
        const DIM           = 1 << 1;
        const ITALIC        = 1 << 2;
        const INVERSE       = 1 << 3;
        const HIDDEN        = 1 << 4;
        const STRIKETHROUGH = 1 << 5;
        const WRAPPED       = 1 << 6;
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cell {
    pub c: char,
    pub fg: Color,
    pub bg: Color,
    pub underline_color: Option<Color>,
    pub underline_style: UnderlineStyle,
    pub flags: CellFlags,
}

impl Default for Cell {
    fn default() -> Self {
        Self {
            c: ' ',
            fg: Color::Default,
            bg: Color::Default,
            underline_color: None,
            underline_style: UnderlineStyle::None,
            flags: CellFlags::empty(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Cursor {
    pub row: usize,
    pub col: usize,
    pub visible: bool,
}

pub struct TerminalGrid {
    rows: usize,
    cols: usize,
    grid: Vec<Vec<Cell>>,
    scrollback: Vec<Vec<Cell>>,
    max_scrollback: usize,
    cursor: Cursor,
    dirty_rows: Vec<bool>,
}

impl TerminalGrid {
    pub fn new(rows: usize, cols: usize, max_scrollback: usize) -> Self {
        let grid = vec![vec![Cell::default(); cols]; rows];
        let dirty_rows = vec![true; rows];
        Self {
            rows,
            cols,
            grid,
            scrollback: Vec::with_capacity(max_scrollback),
            max_scrollback,
            cursor: Cursor {
                row: 0,
                col: 0,
                visible: true,
            },
            dirty_rows,
        }
    }

    pub fn resize(&mut self, new_rows: usize, new_cols: usize) {
        let mut new_grid = vec![vec![Cell::default(); new_cols]; new_rows];
        for r in 0..new_rows.min(self.rows) {
            for c in 0..new_cols.min(self.cols) {
                new_grid[r][c] = self.grid[r][c].clone();
            }
        }
        self.grid = new_grid;
        self.rows = new_rows;
        self.cols = new_cols;
        self.dirty_rows = vec![true; new_rows];
        self.cursor.row = self.cursor.row.min(new_rows.saturating_sub(1));
        self.cursor.col = self.cursor.col.min(new_cols.saturating_sub(1));
    }

    pub fn write_char(&mut self, c: char, template: &Cell) {
        if self.cursor.col >= self.cols {
            self.cursor.col = 0;
            self.line_feed();
        }
        let r = self.cursor.row;
        let col = self.cursor.col;
        if r < self.rows && col < self.cols {
            self.grid[r][col] = Cell {
                c,
                fg: template.fg,
                bg: template.bg,
                underline_color: template.underline_color,
                underline_style: template.underline_style,
                flags: template.flags,
            };
            self.dirty_rows[r] = true;
            self.cursor.col += 1;
        }
    }

    pub fn line_feed(&mut self) {
        if self.cursor.row + 1 >= self.rows {
            self.scroll_up(1);
        } else {
            self.cursor.row += 1;
        }
    }

    pub fn scroll_up(&mut self, count: usize) {
        for _ in 0..count {
            if self.rows > 0 {
                let first_line = self.grid.remove(0);
                if self.scrollback.len() >= self.max_scrollback {
                    self.scrollback.remove(0);
                }
                self.scrollback.push(first_line);
                self.grid.push(vec![Cell::default(); self.cols]);
            }
        }
        self.dirty_rows.fill(true);
    }

    pub fn clear_screen(&mut self) {
        for row in &mut self.grid {
            row.fill(Cell::default());
        }
        self.cursor.row = 0;
        self.cursor.col = 0;
        self.dirty_rows.fill(true);
    }

    pub fn clear_line(&mut self, row: usize) {
        if row < self.rows {
            self.grid[row].fill(Cell::default());
            self.dirty_rows[row] = true;
        }
    }

    pub fn set_cursor(&mut self, row: usize, col: usize) {
        self.cursor.row = row.min(self.rows.saturating_sub(1));
        self.cursor.col = col.min(self.cols.saturating_sub(1));
    }

    pub fn cursor(&self) -> &Cursor {
        &self.cursor
    }

    pub fn cell(&self, row: usize, col: usize) -> Option<&Cell> {
        self.grid.get(row).and_then(|r| r.get(col))
    }

    pub fn is_row_dirty(&self, row: usize) -> bool {
        self.dirty_rows.get(row).copied().unwrap_or(false)
    }

    pub fn mark_clean(&mut self) {
        self.dirty_rows.fill(false);
    }

    pub fn rows(&self) -> usize {
        self.rows
    }

    pub fn cols(&self) -> usize {
        self.cols
    }

    pub fn scrollback_len(&self) -> usize {
        self.scrollback.len()
    }
}
