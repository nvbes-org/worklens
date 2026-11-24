use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TriggerAction {
    PlaySound(String),
    Notification { title: String, message: String },
    HighlightText { color: String },
    PromptPassword,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerRule {
    pub id: String,
    pub pattern: String,
    pub action: TriggerAction,
    pub enabled: bool,
}

pub struct TriggerEngine {
    rules: Vec<(TriggerRule, Regex)>,
}

impl Default for TriggerEngine {
    fn default() -> Self {
        Self { rules: Vec::new() }
    }
}

impl TriggerEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_rule(&mut self, rule: TriggerRule) -> Result<(), regex::Error> {
        let compiled = Regex::new(&rule.pattern)?;
        self.rules.push((rule, compiled));
        Ok(())
    }

    pub fn process_text(&self, text: &str) -> Vec<TriggerAction> {
        let mut triggered = Vec::new();
        for (rule, regex) in &self.rules {
            if rule.enabled && regex.is_match(text) {
                triggered.push(rule.action.clone());
            }
        }
        triggered
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum BadgePosition {
    #[default]
    TopRight,
    BottomRight,
    TopLeft,
    BottomLeft,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkBadge {
    pub text: String,
    pub position: BadgePosition,
    pub opacity: f32,
    pub font_size: f32,
}

impl WatermarkBadge {
    pub fn new(text: String) -> Self {
        Self {
            text,
            position: BadgePosition::TopRight,
            opacity: 0.15,
            font_size: 32.0,
        }
    }

    pub fn git_branch(branch: &str) -> Self {
        Self::new(format!(" {branch}"))
    }

    pub fn host_user(user: &str, host: &str) -> Self {
        Self::new(format!("{user}@{host}"))
    }
}
