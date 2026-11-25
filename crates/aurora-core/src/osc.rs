use crate::error::{AuroraError, Result};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShellPromptKind {
    Initial,
    Secondary,
    Right,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OscEvent {
    SetWindowTitle(String),
    CurrentWorkingDirectory {
        hostname: Option<String>,
        path: String,
    },
    Hyperlink {
        id: Option<String>,
        uri: Option<String>,
    },
    ClipboardSet {
        target: String,
        content: String,
    },
    ClipboardQuery {
        target: String,
    },
    Notification {
        title: Option<String>,
        body: String,
    },
    SetForegroundColor(String),
    QueryForegroundColor,
    SetBackgroundColor(String),
    QueryBackgroundColor,
    SetCursorColor(String),
    QueryCursorColor,
    SetPaletteColor {
        index: u8,
        color: String,
    },
    ResetPaletteColor(Option<u8>),
    ResetForegroundColor,
    ResetBackgroundColor,
    ResetCursorColor,
    ITerm2Action {
        name: String,
        args: String,
    },
    ShellPromptStart(ShellPromptKind),
    ShellCommandStart,
    ShellCommandExecuted,
    ShellCommandFinished {
        exit_code: i32,
    },
}

pub struct OscParser;

impl OscParser {
    pub fn parse(payload: &str) -> Result<Option<OscEvent>> {
        let (cmd_num, rest) = match payload.split_once(';') {
            Some((num, data)) => (num.trim(), data),
            None => (payload.trim(), ""),
        };

        match cmd_num {
            "0" | "2" => Ok(Some(OscEvent::SetWindowTitle(rest.to_string()))),
            "4" => Self::parse_osc_4(rest),
            "7" => Self::parse_osc_7(rest),
            "8" => Self::parse_osc_8(rest),
            "9" => Ok(Some(OscEvent::Notification {
                title: None,
                body: rest.to_string(),
            })),
            "10" => {
                if rest.trim() == "?" {
                    Ok(Some(OscEvent::QueryForegroundColor))
                } else {
                    Ok(Some(OscEvent::SetForegroundColor(rest.to_string())))
                }
            }
            "11" => {
                if rest.trim() == "?" {
                    Ok(Some(OscEvent::QueryBackgroundColor))
                } else {
                    Ok(Some(OscEvent::SetBackgroundColor(rest.to_string())))
                }
            }
            "12" => {
                if rest.trim() == "?" {
                    Ok(Some(OscEvent::QueryCursorColor))
                } else {
                    Ok(Some(OscEvent::SetCursorColor(rest.to_string())))
                }
            }
            "52" => Self::parse_osc_52(rest),
            "99" => Self::parse_osc_99(rest),
            "104" => {
                let idx = if rest.trim().is_empty() {
                    None
                } else {
                    rest.trim().parse::<u8>().ok()
                };
                Ok(Some(OscEvent::ResetPaletteColor(idx)))
            }
            "110" => Ok(Some(OscEvent::ResetForegroundColor)),
            "111" => Ok(Some(OscEvent::ResetBackgroundColor)),
            "112" => Ok(Some(OscEvent::ResetCursorColor)),
            "133" => Self::parse_osc_133(rest),
            "777" => Self::parse_osc_777(rest),
            "1337" => Self::parse_osc_1337(rest),
            _ => Ok(None),
        }
    }

    fn percent_decode(input: &str) -> String {
        let mut bytes = Vec::new();
        let b = input.as_bytes();
        let mut i = 0;
        while i < b.len() {
            if b[i] == b'%' && i + 2 < b.len() {
                if let Ok(val) =
                    u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or(""), 16)
                {
                    bytes.push(val);
                    i += 3;
                    continue;
                }
            }
            bytes.push(b[i]);
            i += 1;
        }
        String::from_utf8_lossy(&bytes).to_string()
    }

    fn parse_osc_4(data: &str) -> Result<Option<OscEvent>> {
        let (idx_str, spec) = match data.split_once(';') {
            Some((i, s)) => (i.trim(), s.trim()),
            None => return Ok(None),
        };
        let index = idx_str.parse::<u8>().unwrap_or(0);
        Ok(Some(OscEvent::SetPaletteColor {
            index,
            color: spec.to_string(),
        }))
    }

    fn parse_osc_7(data: &str) -> Result<Option<OscEvent>> {
        let decoded = Self::percent_decode(data);
        if let Some(uri) = decoded.strip_prefix("file://") {
            let (hostname, path) = match uri.split_once('/') {
                Some((h, p)) => {
                    let host = if h.is_empty() || h == "localhost" {
                        None
                    } else {
                        Some(h.to_string())
                    };
                    (host, format!("/{p}"))
                }
                None => (None, "/".to_string()),
            };
            Ok(Some(OscEvent::CurrentWorkingDirectory { hostname, path }))
        } else {
            Ok(Some(OscEvent::CurrentWorkingDirectory {
                hostname: None,
                path: decoded,
            }))
        }
    }

    fn parse_osc_8(data: &str) -> Result<Option<OscEvent>> {
        let (params, uri) = match data.split_once(';') {
            Some((p, u)) => (p, u),
            None => ("", data),
        };

        let mut id = None;
        for part in params.split(':') {
            if let Some(val) = part.strip_prefix("id=") {
                id = Some(val.to_string());
            }
        }

        let clean_uri = if uri.is_empty() {
            None
        } else {
            Some(uri.to_string())
        };

        Ok(Some(OscEvent::Hyperlink { id, uri: clean_uri }))
    }

    fn parse_osc_52(data: &str) -> Result<Option<OscEvent>> {
        let (target, b64_payload) = match data.split_once(';') {
            Some((t, p)) => (t.to_string(), p.trim()),
            None => return Ok(None),
        };

        if b64_payload == "?" {
            return Ok(Some(OscEvent::ClipboardQuery { target }));
        }

        let cleaned: String = b64_payload.chars().filter(|c| !c.is_whitespace()).collect();
        let bytes = BASE64
            .decode(cleaned.as_bytes())
            .map_err(|e| AuroraError::Base64Decode(e.to_string()))?;
        let content = String::from_utf8_lossy(&bytes).to_string();

        Ok(Some(OscEvent::ClipboardSet { target, content }))
    }

    fn parse_osc_99(data: &str) -> Result<Option<OscEvent>> {
        let (metadata, body) = match data.split_once(';') {
            Some((m, b)) => (m, b),
            None => ("", data),
        };
        let mut title = None;
        for param in metadata.split(':') {
            if let Some(t) = param.strip_prefix("i=") {
                title = Some(t.to_string());
            }
        }
        Ok(Some(OscEvent::Notification {
            title,
            body: body.to_string(),
        }))
    }

    fn parse_osc_133(data: &str) -> Result<Option<OscEvent>> {
        let parts: Vec<&str> = data.split(';').collect();
        if parts.is_empty() {
            return Ok(None);
        }

        match parts[0] {
            "A" => {
                let kind = match parts.get(1).copied() {
                    Some("k=s") => ShellPromptKind::Secondary,
                    Some("k=r") => ShellPromptKind::Right,
                    _ => ShellPromptKind::Initial,
                };
                Ok(Some(OscEvent::ShellPromptStart(kind)))
            }
            "B" => Ok(Some(OscEvent::ShellCommandStart)),
            "C" => Ok(Some(OscEvent::ShellCommandExecuted)),
            "D" => {
                let code = parts
                    .get(1)
                    .and_then(|s| s.parse::<i32>().ok())
                    .unwrap_or(0);
                Ok(Some(OscEvent::ShellCommandFinished { exit_code: code }))
            }
            _ => Ok(None),
        }
    }

    fn parse_osc_777(data: &str) -> Result<Option<OscEvent>> {
        let parts: Vec<&str> = data.split(';').collect();
        if parts.is_empty() {
            return Ok(None);
        }
        if parts[0] == "notify" {
            let title = parts.get(1).map(|s| s.to_string());
            let body = parts.get(2..).map(|p| p.join(";")).unwrap_or_default();
            Ok(Some(OscEvent::Notification { title, body }))
        } else {
            Ok(None)
        }
    }

    fn parse_osc_1337(data: &str) -> Result<Option<OscEvent>> {
        let (name, args) = match data.split_once('=') {
            Some((n, a)) => (n.to_string(), a.to_string()),
            None => (data.to_string(), String::new()),
        };
        Ok(Some(OscEvent::ITerm2Action { name, args }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_osc_0_and_2_window_title() {
        let ev = OscParser::parse("2;Mon Projet").unwrap().unwrap();
        assert_eq!(ev, OscEvent::SetWindowTitle("Mon Projet".to_string()));

        let ev_utf8 = OscParser::parse("0;🧪 Test Titre").unwrap().unwrap();
        assert_eq!(ev_utf8, OscEvent::SetWindowTitle("🧪 Test Titre".to_string()));
    }

    #[test]
    fn test_osc_7_cwd() {
        let ev1 = OscParser::parse("7;file://localhost/Users/dev/project")
            .unwrap()
            .unwrap();
        assert_eq!(
            ev1,
            OscEvent::CurrentWorkingDirectory {
                hostname: None,
                path: "/Users/dev/project".to_string(),
            }
        );

        let ev2 = OscParser::parse("7;file://macbook/home/user/my%20folder")
            .unwrap()
            .unwrap();
        assert_eq!(
            ev2,
            OscEvent::CurrentWorkingDirectory {
                hostname: Some("macbook".to_string()),
                path: "/home/user/my folder".to_string(),
            }
        );
    }

    #[test]
    fn test_osc_8_hyperlink() {
        let ev = OscParser::parse("8;id=link1;https://github.com")
            .unwrap()
            .unwrap();
        assert_eq!(
            ev,
            OscEvent::Hyperlink {
                id: Some("link1".to_string()),
                uri: Some("https://github.com".to_string()),
            }
        );

        let close_ev = OscParser::parse("8;;").unwrap().unwrap();
        assert_eq!(
            close_ev,
            OscEvent::Hyperlink {
                id: None,
                uri: None,
            }
        );
    }

    #[test]
    fn test_osc_52_clipboard() {
        let ev = OscParser::parse("52;c;SGVsbG8gV29ybGQ=").unwrap().unwrap();
        assert_eq!(
            ev,
            OscEvent::ClipboardSet {
                target: "c".to_string(),
                content: "Hello World".to_string(),
            }
        );

        let query = OscParser::parse("52;c;?").unwrap().unwrap();
        assert_eq!(query, OscEvent::ClipboardQuery { target: "c".to_string() });
    }

    #[test]
    fn test_osc_notifications() {
        let ev9 = OscParser::parse("9;Build completed").unwrap().unwrap();
        assert_eq!(
            ev9,
            OscEvent::Notification {
                title: None,
                body: "Build completed".to_string(),
            }
        );

        let ev777 = OscParser::parse("777;notify;Compilation;Success")
            .unwrap()
            .unwrap();
        assert_eq!(
            ev777,
            OscEvent::Notification {
                title: Some("Compilation".to_string()),
                body: "Success".to_string(),
            }
        );
    }

    #[test]
    fn test_osc_dynamic_colors() {
        let fg = OscParser::parse("10;#ffffff").unwrap().unwrap();
        assert_eq!(fg, OscEvent::SetForegroundColor("#ffffff".to_string()));

        let bg_q = OscParser::parse("11;?").unwrap().unwrap();
        assert_eq!(bg_q, OscEvent::QueryBackgroundColor);

        let cur = OscParser::parse("12;#38bdf8").unwrap().unwrap();
        assert_eq!(cur, OscEvent::SetCursorColor("#38bdf8".to_string()));

        let pal = OscParser::parse("4;1;#ff0000").unwrap().unwrap();
        assert_eq!(
            pal,
            OscEvent::SetPaletteColor {
                index: 1,
                color: "#ff0000".to_string(),
            }
        );

        let r111 = OscParser::parse("111").unwrap().unwrap();
        assert_eq!(r111, OscEvent::ResetBackgroundColor);

        let r112 = OscParser::parse("112").unwrap().unwrap();
        assert_eq!(r112, OscEvent::ResetCursorColor);

        let r104 = OscParser::parse("104").unwrap().unwrap();
        assert_eq!(r104, OscEvent::ResetPaletteColor(None));
    }

    #[test]
    fn test_osc_iterm2() {
        let iterm = OscParser::parse("1337;File=inline=1;width=4:AAAA")
            .unwrap()
            .unwrap();
        assert_eq!(
            iterm,
            OscEvent::ITerm2Action {
                name: "File".to_string(),
                args: "inline=1;width=4:AAAA".to_string(),
            }
        );
    }
}
