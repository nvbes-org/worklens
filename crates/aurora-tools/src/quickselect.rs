use regex::Regex;
use std::sync::LazyLock;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum QuickSelectKind {
    Url,
    GitHash,
    IpAddress,
    FilePath,
    Uuid,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuickSelectMatch {
    pub hint: String,
    pub text: String,
    pub kind: QuickSelectKind,
    pub row: usize,
    pub col_start: usize,
    pub col_end: usize,
}

static URL_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"https?://[^\s<>]+").unwrap()
});

static GIT_HASH_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b[0-9a-f]{7,40}\b").unwrap()
});

static IP_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b").unwrap()
});

static FILE_PATH_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:/[a-zA-Z0-9_\.\-]+)+|[a-zA-Z0-9_\.\-]+/[a-zA-Z0-9_\.\-]+").unwrap()
});

static UUID_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b").unwrap()
});

pub struct QuickSelectScanner;

impl QuickSelectScanner {
    pub fn scan_lines(lines: &[&str]) -> Vec<QuickSelectMatch> {
        let mut matches = Vec::new();
        let mut hint_index = 0;

        for (row, line) in lines.iter().enumerate() {
            // Find URLs
            for m in URL_REGEX.find_iter(line) {
                let hint = Self::generate_hint(hint_index);
                hint_index += 1;
                matches.push(QuickSelectMatch {
                    hint,
                    text: m.as_str().to_string(),
                    kind: QuickSelectKind::Url,
                    row,
                    col_start: m.start(),
                    col_end: m.end(),
                });
            }

            // Find UUIDs
            for m in UUID_REGEX.find_iter(line) {
                let hint = Self::generate_hint(hint_index);
                hint_index += 1;
                matches.push(QuickSelectMatch {
                    hint,
                    text: m.as_str().to_string(),
                    kind: QuickSelectKind::Uuid,
                    row,
                    col_start: m.start(),
                    col_end: m.end(),
                });
            }

            // Find Git Hashes
            for m in GIT_HASH_REGEX.find_iter(line) {
                let hint = Self::generate_hint(hint_index);
                hint_index += 1;
                matches.push(QuickSelectMatch {
                    hint,
                    text: m.as_str().to_string(),
                    kind: QuickSelectKind::GitHash,
                    row,
                    col_start: m.start(),
                    col_end: m.end(),
                });
            }

            // Find IPs
            for m in IP_REGEX.find_iter(line) {
                let hint = Self::generate_hint(hint_index);
                hint_index += 1;
                matches.push(QuickSelectMatch {
                    hint,
                    text: m.as_str().to_string(),
                    kind: QuickSelectKind::IpAddress,
                    row,
                    col_start: m.start(),
                    col_end: m.end(),
                });
            }

            // Find File Paths
            for m in FILE_PATH_REGEX.find_iter(line) {
                let text = m.as_str();
                if !text.starts_with("http") && !text.chars().all(|c| c.is_ascii_hexdigit()) {
                    let hint = Self::generate_hint(hint_index);
                    hint_index += 1;
                    matches.push(QuickSelectMatch {
                        hint,
                        text: text.to_string(),
                        kind: QuickSelectKind::FilePath,
                        row,
                        col_start: m.start(),
                        col_end: m.end(),
                    });
                }
            }
        }

        matches
    }

    pub fn resolve_hint<'a>(matches: &'a [QuickSelectMatch], hint: &str) -> Option<&'a QuickSelectMatch> {
        matches.iter().find(|m| m.hint.eq_ignore_ascii_case(hint))
    }

    fn generate_hint(idx: usize) -> String {
        let first = (b'a' + ((idx / 26) % 26) as u8) as char;
        let second = (b'a' + (idx % 26) as u8) as char;
        format!("{first}{second}")
    }
}
