use regex::Regex;
use std::sync::LazyLock;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SecretType {
    AwsAccessKey,
    GitHubToken,
    PrivateKey,
    GenericPasswordOrToken,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardEntry {
    pub content: String,
    pub timestamp: DateTime<Utc>,
    pub detected_secret: Option<SecretType>,
}

static AWS_KEY_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\bAKIA[0-9A-Z]{16}\b").unwrap()
});

static GITHUB_TOKEN_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}\b|github_pat_[A-Za-z0-9_]{82}").unwrap()
});

static PRIVATE_KEY_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----").unwrap()
});

pub struct SmartClipboard {
    history: Vec<ClipboardEntry>,
    max_history: usize,
}

impl Default for SmartClipboard {
    fn default() -> Self {
        Self {
            history: Vec::new(),
            max_history: 50,
        }
    }
}

impl SmartClipboard {
    pub fn new(max_history: usize) -> Self {
        Self {
            history: Vec::with_capacity(max_history),
            max_history,
        }
    }

    pub fn record_copy(&mut self, content: &str) -> Option<SecretType> {
        let detected = Self::detect_secret(content);
        let entry = ClipboardEntry {
            content: content.to_string(),
            timestamp: Utc::now(),
            detected_secret: detected.clone(),
        };

        self.history.retain(|item| item.content != content);
        if self.history.len() >= self.max_history {
            self.history.pop();
        }
        self.history.insert(0, entry);

        detected
    }

    pub fn detect_secret(content: &str) -> Option<SecretType> {
        if PRIVATE_KEY_REGEX.is_match(content) {
            Some(SecretType::PrivateKey)
        } else if AWS_KEY_REGEX.is_match(content) {
            Some(SecretType::AwsAccessKey)
        } else if GITHUB_TOKEN_REGEX.is_match(content) {
            Some(SecretType::GitHubToken)
        } else if content.contains("password=") || content.contains("SECRET_KEY=") {
            Some(SecretType::GenericPasswordOrToken)
        } else {
            None
        }
    }

    pub fn history(&self) -> &[ClipboardEntry] {
        &self.history
    }

    pub fn search(&self, query: &str) -> Vec<&ClipboardEntry> {
        let q = query.to_lowercase();
        self.history
            .iter()
            .filter(|e| e.content.to_lowercase().contains(&q))
            .collect()
    }
}
