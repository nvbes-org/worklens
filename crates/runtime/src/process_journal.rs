use regex::Regex;
use std::{
    collections::{HashMap, VecDeque},
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use uuid::Uuid;
use worklens_core::{LogLevel, LogStream, ParsedLink, ParsedLinkKind, ProcessJournalEntry};

const MAX_RING_BUFFER_ENTRIES: usize = 10_000;

#[derive(Clone)]
pub struct ProcessJournalManager {
    buffers: Arc<Mutex<HashMap<String, VecDeque<ProcessJournalEntry>>>>,
    log_dir: Option<PathBuf>,
    db: Option<Arc<lilia_db::Database>>,
}

impl ProcessJournalManager {
    pub fn new(log_dir: Option<PathBuf>) -> Self {
        Self::with_db(log_dir, None)
    }

    pub fn with_db(
        log_dir: Option<PathBuf>,
        db: Option<Arc<lilia_db::Database>>,
    ) -> Self {
        if let Some(ref dir) = log_dir {
            let _ = std::fs::create_dir_all(dir);
        }
        Self {
            buffers: Arc::new(Mutex::new(HashMap::new())),
            log_dir,
            db,
        }
    }

    pub fn append(
        &self,
        process_id: &str,
        stream: LogStream,
        raw_text: &str,
    ) -> Vec<ProcessJournalEntry> {
        let lines: Vec<&str> = raw_text.split('\n').collect();
        let mut created_entries = Vec::new();

        let mut lock = self.buffers.lock().unwrap();
        let buffer = lock
            .entry(process_id.to_string())
            .or_insert_with(VecDeque::new);

        for line in lines {
            if line.is_empty() && created_entries.len() > 1 {
                continue;
            }
            let entry = Self::parse_line(process_id, stream, line);

            if let Some(ref dir) = self.log_dir {
                let log_file = dir.join(format!("{process_id}.log"));
                if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log_file) {
                    let _ = writeln!(
                        f,
                        "[{}] [{:?}] [{:?}] {}",
                        entry.timestamp, entry.stream, entry.level, entry.text
                    );
                }
            }

            if let Some(ref db) = self.db {
                let _ = db.system().fts("process_logs").index(
                    &entry.id,
                    &format!("[{process_id}] {}", entry.text),
                );
            }

            buffer.push_back(entry.clone());
            if buffer.len() > MAX_RING_BUFFER_ENTRIES {
                buffer.pop_front();
            }
            created_entries.push(entry);
        }

        created_entries
    }

    pub fn get_logs(
        &self,
        process_id: &str,
        level_filter: Option<LogLevel>,
        stream_filter: Option<LogStream>,
        search_query: Option<&str>,
        limit: usize,
    ) -> Vec<ProcessJournalEntry> {
        let lock = self.buffers.lock().unwrap();
        let Some(buffer) = lock.get(process_id) else {
            return Vec::new();
        };

        let query = search_query.map(|s| s.to_lowercase());

        buffer
            .iter()
            .rev()
            .filter(|e| {
                if let Some(lvl) = level_filter {
                    if e.level != lvl {
                        return false;
                    }
                }
                if let Some(st) = stream_filter {
                    if e.stream != st {
                        return false;
                    }
                }
                if let Some(ref q) = query {
                    if !e.text.to_lowercase().contains(q) {
                        return false;
                    }
                }
                true
            })
            .take(limit)
            .cloned()
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect()
    }

    pub fn clear(&self, process_id: &str) {
        let mut lock = self.buffers.lock().unwrap();
        if let Some(buf) = lock.get_mut(process_id) {
            buf.clear();
        }
        if let Some(ref dir) = self.log_dir {
            let log_file = dir.join(format!("{process_id}.log"));
            let _ = std::fs::remove_file(log_file);
        }
    }

    pub fn parse_line(process_id: &str, stream: LogStream, line: &str) -> ProcessJournalEntry {
        let clean_text = strip_ansi_escapes(line);
        let level = detect_log_level(stream, &clean_text);
        let parsed_links = extract_links(&clean_text);

        ProcessJournalEntry {
            id: format!("log_{}", Uuid::new_v4().simple()),
            process_id: process_id.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            stream,
            level,
            text: clean_text,
            parsed_links,
        }
    }
}

fn detect_log_level(stream: LogStream, text: &str) -> LogLevel {
    let lower = text.to_lowercase();
    if lower.contains("error")
        || lower.contains("failed")
        || lower.contains("fatal")
        || lower.contains("panic")
        || lower.contains("exception")
    {
        LogLevel::Error
    } else if lower.contains("warn") || lower.contains("warning") {
        LogLevel::Warn
    } else if lower.contains("debug") || lower.contains("trace") {
        LogLevel::Debug
    } else if stream == LogStream::Stderr && !lower.contains("info") {
        LogLevel::Warn
    } else {
        LogLevel::Info
    }
}

fn extract_links(text: &str) -> Vec<ParsedLink> {
    let mut links = Vec::new();

    // Match URLs
    let url_re =
        Regex::new(r"https?://(?:localhost|[0-9.]+|[a-zA-Z0-9.-]+)(?::[0-9]+)?(?:/[^\s]*)?")
            .unwrap();
    for mat in url_re.find_iter(text) {
        let target = mat.as_str().to_string();
        links.push(ParsedLink {
            kind: ParsedLinkKind::Url,
            target: target.clone(),
            label: target,
            line: None,
            column: None,
        });
    }

    // Match File Locations (e.g. src/main.rs:42:10 or app.tsx:15)
    let file_re = Regex::new(
        r"([a-zA-Z0-9_\-./]+\.(?:rs|ts|tsx|js|jsx|json|toml|py|go|css|html)):(\d+)(?::(\d+))?",
    )
    .unwrap();
    for cap in file_re.captures_iter(text) {
        if let Some(file_mat) = cap.get(1) {
            let file_path = file_mat.as_str().to_string();
            let line_num: Option<u32> = cap.get(2).and_then(|m| m.as_str().parse().ok());
            let col_num: Option<u32> = cap.get(3).and_then(|m| m.as_str().parse().ok());

            let label = if let (Some(l), Some(c)) = (line_num, col_num) {
                format!("{file_path}:{l}:{c}")
            } else if let Some(l) = line_num {
                format!("{file_path}:{l}")
            } else {
                file_path.clone()
            };

            links.push(ParsedLink {
                kind: ParsedLinkKind::FileLocation,
                target: file_path,
                label,
                line: line_num,
                column: col_num,
            });
        }
    }

    links
}

fn strip_ansi_escapes(input: &str) -> String {
    let re = Regex::new(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])").unwrap();
    re.replace_all(input, "").to_string()
}
