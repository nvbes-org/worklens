use crate::{command, error, Result};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use worklens_core::*;

pub async fn collect(root: &Path) -> Result<Graph> {
    let selected = resolve_pnpm(root).await?;
    let lockfile_only = at_least(&selected.version, 10, 23) && root.join("pnpm-lock.yaml").exists();
    let mut args: Vec<&str> = vec!["list", "--recursive", "--depth", "1", "--json"];
    if lockfile_only {
        args.push("--lockfile-only");
    }
    let output = command::run(root, &selected.executable, &args).await?;
    let packages: Vec<Value> = serde_json::from_slice(&output).map_err(|e| error(e.to_string()))?;
    let mut graph = Graph {
        components: vec![],
        nodes: vec![],
        edges: vec![],
        sources: vec![],
    };
    for package in packages {
        crate::catalog::add_resolved(&mut graph, root, &package);
    }
    graph.sources.push(Provenance::observed(if lockfile_only {
        "pnpm list --recursive --depth 1 --json --lockfile-only (lockfile resolution data)"
    } else {
        "pnpm list --recursive --depth 1 --json (installed resolution data)"
    }));
    Ok(graph)
}

struct Selected {
    executable: String,
    version: String,
}

// Pick a pnpm that satisfies the observed repo's declared package manager
// requirement (packageManager / engines.pnpm). Candidates come from the project
// itself, the inherited PATH, then conventional toolchain locations. The first
// candidate reporting a satisfying version wins; if none does, the first working
// candidate is used so its failure message (with version details) surfaces.
async fn resolve_pnpm(root: &Path) -> Result<Selected> {
    let required = read_pnpm_requirement(root);
    let mut candidates = Vec::new();
    for entry in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
        let abs = if entry.is_absolute() {
            entry
        } else {
            root.join(&entry)
        };
        push_unique(&mut candidates, abs.join("pnpm"));
    }
    if let Some(home) = home_dir() {
        for dir in [
            "Library/pnpm/bin",
            ".local/share/pnpm",
            ".local/bin",
            ".bun/bin",
        ] {
            push_unique(&mut candidates, home.join(dir).join("pnpm"));
        }
    }
    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        push_unique(&mut candidates, PathBuf::from(dir).join("pnpm"));
    }

    let mut fallback: Option<Selected> = None;
    for candidate in candidates {
        let Ok(output) = command::run(root, &candidate.to_string_lossy(), &["--version"]).await
        else {
            continue;
        };
        let Ok(version) = String::from_utf8(output) else {
            continue;
        };
        let version = version.trim().to_string();
        let selected = Selected { executable: candidate.to_string_lossy().into_owned(), version };
        let Some(bound) = required else {
            return Ok(selected);
        };
        if satisfies_simple(&selected.version, bound) {
            return Ok(selected);
        }
        if fallback.is_none() {
            fallback = Some(selected);
        }
    }
    fallback.ok_or_else(|| error("pnpm not found in PATH or standard toolchain locations"))
}

fn home_dir() -> Option<PathBuf> {
    directories::BaseDirs::new().map(|d| d.home_dir().to_path_buf())
}

fn push_unique(list: &mut Vec<PathBuf>, path: PathBuf) {
    if !list.contains(&path) {
        list.push(path);
    }
}

// Lower-bound version required by the observed repo, from "packageManager" or
// "engines".pnpm. The first x.y.z token in either value is used as the bound.
fn read_pnpm_requirement(root: &Path) -> Option<Version> {
    let text = std::fs::read_to_string(root.join("package.json")).ok()?;
    let json: Value = serde_json::from_str(&text).ok()?;
    let field = json
        .get("packageManager")
        .and_then(Value::as_str)
        .or_else(|| json.get("engines").and_then(|e| e.get("pnpm")).and_then(Value::as_str))?;
    parse_first_version(field)
}

fn parse_first_version(value: &str) -> Option<Version> {
    let version_part = value.split('@').last()?;
    let token = version_part.split_whitespace().find_map(|part| {
        let core = part
            .trim_start_matches(|c| matches!(c, '^' | '>' | '<' | '=' | '~' | 'v'))
            .split('+')
            .next()?;
        (core.chars().next()?.is_ascii_digit()).then(|| core.to_string())
    })?;
    Version::from_str(&token).ok()
}

fn satisfies_simple(version: &str, bound: Version) -> bool {
    version
        .trim_start_matches(|c: char| c == 'v' || c.is_whitespace())
        .parse::<Version>()
        .map(|v| v >= bound)
        .unwrap_or(false)
}

#[derive(Clone, Copy, Debug, PartialOrd, Ord, PartialEq, Eq)]
struct Version {
    major: u64,
    minor: u64,
    patch: u64,
}

impl FromStr for Version {
    type Err = std::num::ParseIntError;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        let mut parts = s.split('.');
        Ok(Version {
            major: parts.next().unwrap_or("0").parse()?,
            minor: parts.next().unwrap_or("0").parse()?,
            patch: parts.next().unwrap_or("0").parse()?,
        })
    }
}

fn at_least(version: &str, major: u64, minor: u64) -> bool {
    version
        .trim_start_matches(|c: char| c == 'v' || c.is_whitespace())
        .parse::<Version>()
        .map(|v| (v.major, v.minor) >= (major, minor))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::Version;
    use super::{at_least, parse_first_version, satisfies_simple};
    use std::str::FromStr;

    #[test]
    fn lockfile_only_version_gate() {
        assert!(at_least("10.23.0", 10, 23));
        assert!(at_least("10.34.5", 10, 23));
        assert!(at_least("v12.5.1", 10, 23));
        assert!(!at_least("10.17.1", 10, 23));
        assert!(!at_least("9.0.0", 10, 23));
        assert!(!at_least("garbage", 10, 23));
        assert!(!at_least("", 10, 23));
    }

    #[test]
    fn requirement_bounds() {
        assert_eq!(
            parse_first_version("pnpm@11.18.0"),
            Some(Version::from_str("11.18.0").unwrap())
        );
        assert_eq!(
            parse_first_version(">=11.1.2"),
            Some(Version::from_str("11.1.2").unwrap())
        );
        assert_eq!(
            parse_first_version(">=10.0.0 <11.0.0"),
            Some(Version::from_str("10.0.0").unwrap())
        );
        assert_eq!(parse_first_version(""), None);
    }

    #[test]
    fn satisfies_bound() {
        assert!(satisfies_simple("11.18.0", Version::from_str("11.1.2").unwrap()));
        assert!(satisfies_simple("11.5.2", Version::from_str("11.1.2").unwrap()));
        assert!(!satisfies_simple("10.17.1", Version::from_str("11.1.2").unwrap()));
        assert!(!satisfies_simple("garbage", Version::from_str("11.1.2").unwrap()));
    }
}