use crate::{Result, command, error, paths, service::Service};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::{collections::BTreeSet, path::Path};
use worklens_core::{ComponentCommit, ComponentMetadata, NxAffected, Project, Repository};

pub async fn query(service: &Service, repo: &Repository, params: &Value) -> Result<Value> {
    let ids: Vec<String> = serde_json::from_value(params["memberIds"].clone())?;
    if ids.is_empty() || ids.len() > 20 {
        return Err(error("Select 1 to 20 component identities"));
    }
    let mut graph = service.graph(repo, false).await?;
    if ids
        .iter()
        .any(|id| id.starts_with("vendor:") || id.starts_with("vendor-dependency:"))
    {
        crate::catalog_vendors::extend(Path::new(&repo.path), &mut graph)?;
    }
    let projects = ids
        .iter()
        .map(|id| {
            graph
                .nodes
                .iter()
                .find(|node| &node.id == id)
                .cloned()
                .ok_or_else(|| error("Component no longer exists; refresh graph"))
        })
        .collect::<Result<Vec<_>>>()?;
    let mut report = inspect(Path::new(&repo.path), &projects).await?;
    report.nx = affected(repo, &projects, params).await;
    Ok(serde_json::to_value(report)?)
}

pub async fn inspect(root: &Path, projects: &[Project]) -> Result<ComponentMetadata> {
    let mut result = ComponentMetadata {
        member_ids: projects.iter().map(|p| p.id.clone()).collect(), collected_at: Utc::now().to_rfc3339(),
        first_commit_at: None, modified_at: None, last_commit: None, size_bytes: None, file_count: None,
        size_scope: "Regular tracked and unignored files; build outputs, caches and symlinks excluded. Nested projects included.".into(),
        dirty: None, integrity: vec![], warnings: vec![],
        nx: NxAffected { affected: None, base: String::new(), head: String::new(), reason: "Not requested".into() },
    };
    for project in projects {
        match crate::metadata_integrity::collect(root, project) {
            Ok(records) => {
                for record in records {
                    if !result
                        .integrity
                        .iter()
                        .any(|r| r.source == record.source && r.value == record.value)
                    {
                        result.integrity.push(record);
                    }
                }
            }
            Err(e) => result.warnings.push(format!("Integrity unavailable: {e}")),
        }
    }
    let directories: BTreeSet<_> = projects
        .iter()
        .filter(|p| !p.external || p.kind == "vendor")
        .map(|p| p.root.as_str())
        .collect();
    if directories.is_empty() {
        result.warnings.push("External package source is not locally measured; publication dates and installed size are unavailable.".into());
        return Ok(result);
    }
    if directories.len() != 1 {
        return Err(error(
            "Metadata identities must share one component directory",
        ));
    }
    let directory = *directories.first().unwrap();
    let directory = if directory.is_empty() { "." } else { directory };
    paths::confined(root, directory)?;
    let pathspec = format!(":(literal){directory}");
    let output = command::git(
        root,
        &[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            &pathspec,
        ],
    )
    .await?;
    let files: BTreeSet<_> = output.split('\0').filter(|path| !path.is_empty()).collect();
    let mut bytes = 0;
    let mut count = 0;
    let mut modified = None;
    let mut incomplete = files.len() > 20_000;
    for file in files.iter().take(20_000) {
        if file.split('/').any(|p| {
            matches!(
                p,
                "node_modules" | "target" | "dist" | "build" | ".git" | ".nx"
            )
        }) {
            continue;
        }
        let Ok(path) = paths::confined(root, file) else {
            incomplete = true;
            continue;
        };
        let Ok(metadata) = std::fs::symlink_metadata(root.join(file)) else {
            incomplete = true;
            continue;
        };
        if !metadata.is_file() || path != root.join(file).canonicalize()? {
            continue;
        }
        bytes += metadata.len();
        count += 1;
        if let Ok(time) = metadata.modified() {
            modified = Some(modified.map_or(time, |old: std::time::SystemTime| old.max(time)));
        }
    }
    if count > 0 || !projects.iter().any(|p| p.kind == "vendor") {
        result.size_bytes = Some(bytes);
        result.file_count = Some(count);
        result.modified_at = modified.map(|time| DateTime::<Utc>::from(time).to_rfc3339());
    } else {
        result.warnings.push("Vendor files are ignored or absent: size and modification date unavailable in the Git inventory.".into());
    }
    if incomplete {
        result.warnings.push("File inventory is partial (20,000 file limit or unreadable/deleted files); size is a lower bound.".into());
    }
    match command::git(
        root,
        &[
            "log",
            "-1",
            "--format=%H%x00%cI%x00%an%x00%s",
            "--",
            &pathspec,
        ],
    )
    .await
    {
        Ok(text) => {
            let fields: Vec<_> = text.trim_end().splitn(4, '\0').collect();
            if fields.len() == 4 {
                result.last_commit = Some(ComponentCommit {
                    sha: fields[0].into(),
                    date: fields[1].into(),
                    author: fields[2].into(),
                    subject: fields[3].into(),
                });
            }
        }
        Err(e) => result
            .warnings
            .push(format!("Git history unavailable: {e}")),
    }
    match command::git(root, &["log", "--reverse", "--format=%cI", "--", &pathspec]).await {
        Ok(text) => result.first_commit_at = text.lines().next().map(str::to_owned),
        Err(e) => result
            .warnings
            .push(format!("First visible commit unavailable: {e}")),
    }
    if command::git(root, &["rev-parse", "--is-shallow-repository"])
        .await
        .is_ok_and(|text| text.trim() == "true")
    {
        result.warnings.push(
            "Shallow clone: addition date is only the first commit available locally.".into(),
        );
    }
    match command::git(
        root,
        &[
            "status",
            "--porcelain",
            "--untracked-files=normal",
            "--",
            &pathspec,
        ],
    )
    .await
    {
        Ok(text) => result.dirty = Some(!text.trim().is_empty()),
        Err(e) => result
            .warnings
            .push(format!("Working tree status unavailable: {e}")),
    }
    Ok(result)
}

async fn affected(repo: &Repository, projects: &[Project], params: &Value) -> NxAffected {
    let mut result = NxAffected {
        affected: None,
        base: params["base"].as_str().unwrap_or("main").into(),
        head: params["head"].as_str().unwrap_or("HEAD").into(),
        reason: "Not requested".into(),
    };
    if params["checkAffected"].as_bool() != Some(true) {
        return result;
    }
    if !projects.iter().any(|p| p.ecosystem == "nx") {
        result.reason = "No Nx identity for this component".into();
        return result;
    }
    if !repo.trusted {
        result.reason = "Repository trust required to execute Nx plugins".into();
        return result;
    }
    let root = Path::new(&repo.path);
    let collect = async {
        let mut revisions = Vec::new();
        for reference in [&result.base, &result.head] {
            if reference.is_empty() || reference.len() > 256 || reference.starts_with('-') {
                return Err(error("Invalid Git comparison reference"));
            }
            let value = command::git(
                root,
                &[
                    "rev-parse",
                    "--verify",
                    "--end-of-options",
                    &format!("{reference}^{{commit}}"),
                ],
            )
            .await?;
            revisions.push(value.trim().to_owned());
        }
        let entry = crate::catalog_nx::executable(root)?;
        let bytes = command::run(
            root,
            "node",
            &[
                &entry,
                "show",
                "projects",
                "--affected",
                "--json",
                &format!("--base={}", revisions[0]),
                &format!("--head={}", revisions[1]),
            ],
        )
        .await?;
        let names: Vec<String> = serde_json::from_slice(&bytes)?;
        Ok::<_, crate::Error>((names, revisions))
    }
    .await;
    match collect {
        Ok((names, revisions)) => {
            result.affected = Some(
                projects
                    .iter()
                    .any(|p| p.ecosystem == "nx" && names.contains(&p.name)),
            );
            result.base = revisions[0].clone();
            result.head = revisions[1].clone();
            result.reason = "Nx show projects --affected; committed comparison only".into();
        }
        Err(e) => result.reason = format!("Nx affected unavailable: {e}"),
    }
    result
}

#[cfg(test)]
#[path = "component_metadata.tests.rs"]
mod tests;
