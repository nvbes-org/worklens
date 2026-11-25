use globset::{Glob, GlobSetBuilder};
use regex::Regex;
use std::path::Path;

pub fn match_path_patterns(path: &Path, patterns: &[String]) -> bool {
    if patterns.is_empty() {
        return false;
    }
    let mut builder = GlobSetBuilder::new();
    for p in patterns {
        if let Ok(glob) = Glob::new(p) {
            builder.add(glob);
        }
    }
    if let Ok(set) = builder.build() {
        set.is_match(path)
    } else {
        false
    }
}

pub fn match_arg_patterns(args: &[String], patterns: &[String]) -> bool {
    if patterns.is_empty() {
        return true;
    }
    let joined = args.join(" ");
    for pattern in patterns {
        if let Ok(re) = Regex::new(pattern) {
            if re.is_match(&joined) {
                return true;
            }
        } else if joined.contains(pattern) {
            return true;
        }
    }
    false
}

pub fn is_env_var_allowed(var_name: &str, allowed: &[String], blocked: &[String]) -> bool {
    if blocked
        .iter()
        .any(|b| b == var_name || (b.ends_with('*') && var_name.starts_with(&b[..b.len() - 1])))
    {
        return false;
    }
    if allowed.is_empty() {
        return true;
    }
    allowed
        .iter()
        .any(|a| a == var_name || (a.ends_with('*') && var_name.starts_with(&a[..a.len() - 1])))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_path_matching() {
        let p = PathBuf::from("src/main.rs");
        assert!(match_path_patterns(&p, &["**/*.rs".into()]));
        assert!(!match_path_patterns(&p, &["**/*.tf".into()]));
    }

    #[test]
    fn test_arg_matching() {
        let args = vec!["show".to_string(), "-json".to_string()];
        assert!(match_arg_patterns(&args, &["^show.*".into()]));
        assert!(!match_arg_patterns(&args, &["^destroy".into()]));
    }

    #[test]
    fn test_env_filtering() {
        assert!(is_env_var_allowed(
            "PATH",
            &["PATH".into()],
            &["AWS_*".into()]
        ));
        assert!(!is_env_var_allowed(
            "AWS_SECRET_KEY",
            &[],
            &["AWS_*".into()]
        ));
    }
}
