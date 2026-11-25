use crate::{Result, catalog, paths};
use std::path::Path;
use worklens_core::Document;

pub async fn list(root: &Path) -> Result<Vec<Document>> {
    Ok(catalog::files(root)
        .await?
        .into_iter()
        .filter(|file| {
            let name = Path::new(file)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_ascii_lowercase();
            name == "readme.md"
                || name == "agents.md"
                || name == "claude.md"
                || name == "instructions.md"
                || name == "copilot-instructions.md"
                || (file.contains(".cursor/rules/") && name.ends_with(".mdc"))
                || (file.contains("/adr/") && name.ends_with(".md"))
        })
        .map(|path| Document {
            title: path.clone(),
            path,
        })
        .collect())
}

pub async fn read(root: &Path, relative: &str) -> Result<String> {
    if !list(root).await?.iter().any(|doc| doc.path == relative) {
        return Err(crate::error("Document is not in the documentation index"));
    }
    paths::read_bounded(&paths::confined(root, relative)?, 128_000)
}
