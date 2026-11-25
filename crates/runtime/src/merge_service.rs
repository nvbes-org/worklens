use crate::{Result, command::git, error, paths};
use std::path::Path;
use worklens_core::{ConflictFileDetails, ConflictHunk, ConflictItem};

pub async fn conflict_list(root: &Path) -> Result<Vec<ConflictItem>> {
    let unmerged_output = git(root, &["diff", "--name-only", "--diff-filter=U"]).await?;
    let mut items = Vec::new();

    for line in unmerged_output.lines() {
        let rel_path = line.trim();
        if rel_path.is_empty() {
            continue;
        }

        let full_path = match paths::confined(root, rel_path) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let mut conflict_count = 0;
        if full_path.exists() {
            if let Ok(content) = paths::read_bounded(&full_path, 1_048_576) {
                for l in content.lines() {
                    if l.starts_with("<<<<<<<") {
                        conflict_count += 1;
                    }
                }
            }
        }

        items.push(ConflictItem {
            path: rel_path.to_string(),
            status: "conflict".to_string(),
            conflict_count,
        });
    }

    Ok(items)
}

pub async fn conflict_details(root: &Path, relative: &str) -> Result<ConflictFileDetails> {
    let path = paths::confined(root, relative)?;
    if !path.exists() {
        return Err(error(format!("Conflicted file does not exist: {relative}")));
    }

    let full_content = paths::read_bounded(&path, 1_048_576)?;
    let hunks = parse_conflict_hunks(&full_content);

    // Try to get stage 1 (base), stage 2 (ours), stage 3 (theirs) from git index
    let base_version = git(root, &["show", &format!(":1:{relative}")]).await.ok();
    let current_version = git(root, &["show", &format!(":2:{relative}")]).await.ok();
    let incoming_version = git(root, &["show", &format!(":3:{relative}")]).await.ok();

    Ok(ConflictFileDetails {
        path: relative.to_string(),
        full_content,
        hunks,
        base_version,
        current_version,
        incoming_version,
    })
}

pub async fn resolve_conflict(root: &Path, relative: &str, resolved_content: &str) -> Result<()> {
    let path = paths::confined(root, relative)?;
    std::fs::write(&path, resolved_content)?;
    git(root, &["add", relative]).await?;
    Ok(())
}

fn parse_conflict_hunks(text: &str) -> Vec<ConflictHunk> {
    let mut hunks = Vec::new();
    let mut in_current = false;
    let mut in_base = false;
    let mut in_incoming = false;

    let mut current_name = String::new();
    let mut current_lines = Vec::new();
    let mut base_lines = Vec::new();
    let mut incoming_lines = Vec::new();

    let mut hunk_index = 0;

    for line in text.lines() {
        if line.starts_with("<<<<<<<") {
            in_current = true;
            in_base = false;
            in_incoming = false;
            current_name = line.trim_start_matches("<<<<<<<").trim().to_string();
            if current_name.is_empty() {
                current_name = "Current (Ours)".to_string();
            }
            current_lines.clear();
            base_lines.clear();
            incoming_lines.clear();
            continue;
        }

        if in_current && line.starts_with("|||||||") {
            in_current = false;
            in_base = true;
            continue;
        }

        if (in_current || in_base) && line.starts_with("=======") {
            in_current = false;
            in_base = false;
            in_incoming = true;
            continue;
        }

        if in_incoming && line.starts_with(">>>>>>>") {
            let mut incoming_name = line.trim_start_matches(">>>>>>>").trim().to_string();
            if incoming_name.is_empty() {
                incoming_name = "Incoming (Theirs)".to_string();
            }

            hunk_index += 1;
            hunks.push(ConflictHunk {
                id: format!("conflict-{hunk_index}"),
                current_name: current_name.clone(),
                current_content: current_lines.join("\n"),
                incoming_name: incoming_name.clone(),
                incoming_content: incoming_lines.join("\n"),
                base_content: if base_lines.is_empty() {
                    None
                } else {
                    Some(base_lines.join("\n"))
                },
            });

            in_incoming = false;
            current_lines.clear();
            base_lines.clear();
            incoming_lines.clear();
            continue;
        }

        if in_current {
            current_lines.push(line);
        } else if in_base {
            base_lines.push(line);
        } else if in_incoming {
            incoming_lines.push(line);
        }
    }

    hunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_conflict_hunks_standard() {
        let sample = "fn main() {\n<<<<<<< HEAD\n    let x = 1;\n=======\n    let x = 2;\n>>>>>>> feature\n    println!(\"{x}\");\n}";
        let hunks = parse_conflict_hunks(sample);
        assert_eq!(hunks.len(), 1);
        assert_eq!(hunks[0].current_name, "HEAD");
        assert_eq!(hunks[0].current_content, "    let x = 1;");
        assert_eq!(hunks[0].incoming_name, "feature");
        assert_eq!(hunks[0].incoming_content, "    let x = 2;");
        assert_eq!(hunks[0].base_content, None);
    }

    #[test]
    fn test_parse_conflict_hunks_diff3() {
        let sample = "<<<<<<< ours\na\n||||||| base\n0\n=======\nb\n>>>>>>> theirs";
        let hunks = parse_conflict_hunks(sample);
        assert_eq!(hunks.len(), 1);
        assert_eq!(hunks[0].current_name, "ours");
        assert_eq!(hunks[0].current_content, "a");
        assert_eq!(hunks[0].incoming_name, "theirs");
        assert_eq!(hunks[0].incoming_content, "b");
        assert_eq!(hunks[0].base_content, Some("0".to_string()));
    }
}
