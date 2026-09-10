use crate::{Result, command::git, error};
use std::path::Path;
use worklens_core::*;

pub async fn repository(path: &Path, trusted: bool) -> Result<Repository> {
    let root = git(path, &["rev-parse", "--show-toplevel"]).await?;
    let root = Path::new(root.trim()).canonicalize()?;
    let common = git(
        &root,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )
    .await?;
    let common = Path::new(common.trim()).canonicalize()?;
    Ok(Repository {
        id: stable_id("repo", &common.to_string_lossy()),
        name: root
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        path: root.to_string_lossy().into_owned(),
        common_dir: common.to_string_lossy().into_owned(),
        trusted,
    })
}

pub fn parse_status(output: &str) -> Vec<FileChange> {
    let mut records = output.split('\0');
    let mut changes = Vec::new();
    while let Some(record) = records.next() {
        if record.len() < 3 {
            continue;
        }
        let bytes = record.as_bytes();
        let previous =
            if bytes[0] == b'R' || bytes[0] == b'C' || bytes[1] == b'R' || bytes[1] == b'C' {
                records.next().map(str::to_owned)
            } else {
                None
            };
        changes.push(FileChange {
            path: record[3..].into(),
            previous_path: previous,
            index_status: (bytes[0] as char).to_string(),
            worktree_status: (bytes[1] as char).to_string(),
        });
    }
    changes
}

pub fn parse_worktrees(output: &str) -> Vec<Worktree> {
    let mut result = Vec::new();
    let mut current: Option<Worktree> = None;
    for line in output.split('\0') {
        if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(tree) = current.take() {
                result.push(tree);
            }
            current = Some(Worktree {
                id: stable_id("worktree", path),
                path: path.into(),
                head: String::new(),
                branch: None,
                locked: false,
                prunable: false,
            });
        } else if let Some(tree) = &mut current {
            if let Some(head) = line.strip_prefix("HEAD ") {
                tree.head = head.into();
            }
            if let Some(branch) = line.strip_prefix("branch refs/heads/") {
                tree.branch = Some(branch.into());
            }
            tree.locked |= line.starts_with("locked");
            tree.prunable |= line.starts_with("prunable");
        }
    }
    if let Some(tree) = current {
        result.push(tree);
    }
    result
}

pub async fn snapshot(repo: Repository, offset: u32) -> Result<GitSnapshot> {
    let path = Path::new(&repo.path);
    let (status, trees, refs, remote_names) = tokio::try_join!(
        git(
            path,
            &["status", "--porcelain=v1", "-z", "--untracked-files=normal"]
        ),
        git(path, &["worktree", "list", "--porcelain", "-z"]),
        git(
            path,
            &[
                "for-each-ref",
                "--format=%(refname:short)%00%(objectname)%00%(upstream:short)%00%(upstream:track)",
                "refs/heads",
                "refs/remotes"
            ]
        ),
        git(path, &["remote"])
    )?;
    let head = git(path, &["rev-parse", "--verify", "HEAD"])
        .await
        .ok()
        .map(|s| s.trim().into());
    let branch = git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .await
        .ok()
        .map(|s| s.trim().into());
    let mut remotes = Vec::new();
    for name in remote_names.lines() {
        let url = git(path, &["remote", "get-url", "--", name]).await?;
        let url = redact_remote(url.trim());
        remotes.push(Remote {
            name: name.into(),
            url,
        });
    }
    let branches = refs
        .lines()
        .filter_map(|line| {
            let columns: Vec<_> = line.split('\0').collect();
            (columns.len() == 4).then(|| Branch {
                name: columns[0].into(),
                head: columns[1].into(),
                upstream: (!columns[2].is_empty()).then(|| columns[2].into()),
                tracking: columns[3].into(),
            })
        })
        .collect();
    let commits = if head.is_some() {
        let skip = format!("--skip={offset}");
        git(
            path,
            &[
                "log",
                "--all",
                "--topo-order",
                "-51",
                &skip,
                "--format=%H%x00%P%x00%an%x00%aI%x00%s%x00",
            ],
        )
        .await?
        .split('\0')
        .collect::<Vec<_>>()
        .chunks(5)
        .filter(|c| c.len() == 5)
        .map(|c| Commit {
            sha: c[0].trim().into(),
            parents: c[1].split_whitespace().map(str::to_owned).collect(),
            author: c[2].into(),
            date: c[3].into(),
            subject: c[4].into(),
        })
        .collect::<Vec<_>>()
    } else {
        vec![]
    };
    let next_offset = (commits.len() > 50).then_some(offset.saturating_add(50));
    let mut provenance = Provenance::observed("git (local refs; no fetch)");
    provenance.revision = head.clone();
    let fetch_time = std::fs::metadata(Path::new(&repo.common_dir).join("FETCH_HEAD"))
        .and_then(|metadata| metadata.modified())
        .ok()
        .map(|time| chrono::DateTime::<chrono::Utc>::from(time).to_rfc3339());
    provenance.detail = Some(match fetch_time {
        Some(time) => format!("Remote refs are local observations. Last recorded FETCH_HEAD update: {time}; not proof all remotes were fetched."),
        None => "Remote refs are local observations. Last fetch time is unknown; Worklens does not fetch.".into(),
    });
    Ok(GitSnapshot {
        repository: repo,
        branch,
        head,
        changes: parse_status(&status),
        branches,
        remotes,
        worktrees: parse_worktrees(&trees),
        commits: commits.into_iter().take(50).collect(),
        next_offset,
        provenance,
    })
}

fn redact_remote(url: &str) -> String {
    if let Some((scheme, rest)) = url.split_once("://")
        && let Some((_, host)) = rest.rsplit_once('@')
    {
        return format!("{scheme}://{host}");
    }
    url.into()
}

pub async fn diff(
    root: &Path,
    path: Option<&str>,
    base: Option<&str>,
    head: Option<&str>,
    staged: bool,
) -> Result<DiffResult> {
    let mut args = vec!["diff", "--no-ext-diff", "--no-textconv", "--no-color"];
    if head.is_some() && base.is_none() {
        args = vec![
            "show",
            "--format=",
            "--root",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
        ];
    }
    let mut resolved = Vec::new();
    for revision in [base, head].into_iter().flatten() {
        let object = format!("{revision}^{{commit}}");
        resolved.push(
            git(
                root,
                &["rev-parse", "--verify", "--end-of-options", &object],
            )
            .await?
            .trim()
            .to_owned(),
        );
    }
    if staged {
        args.push("--cached");
    }
    args.extend(resolved.iter().map(String::as_str));
    args.push("--");
    if let Some(path) = path {
        if Path::new(path).is_absolute()
            || Path::new(path)
                .components()
                .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err(error("Diff path escapes repository"));
        }
        args.push(path);
    }
    let output = git(root, &args).await?;
    let truncated = output.len() > 256_000;
    let binary = output.contains("Binary files ");
    let mut end = output.len().min(256_000);
    while !output.is_char_boundary(end) {
        end -= 1;
    }
    Ok(DiffResult {
        text: output[..end].into(),
        truncated,
        binary,
        provenance: Provenance::observed("git diff"),
    })
}
