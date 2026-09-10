use crate::{Result, error};
use std::{
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
};

pub fn data_dir() -> Result<PathBuf> {
    let path = match std::env::var_os("WORKLENS_DATA_DIR") {
        Some(value) => PathBuf::from(value),
        None => directories::ProjectDirs::from("dev", "worklens", "Worklens")
            .ok_or_else(|| error("No user data directory"))?
            .data_dir()
            .to_owned(),
    };
    if path.exists() && std::fs::symlink_metadata(&path)?.file_type().is_symlink() {
        return Err(error("Data directory must not be a symlink"));
    }
    std::fs::create_dir_all(&path)?;
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700))?;
    Ok(path)
}

pub fn confined(root: &Path, relative: &str) -> Result<PathBuf> {
    if Path::new(relative).is_absolute() {
        return Err(error("Expected a relative repository path"));
    }
    let resolved = root.join(relative).canonicalize()?;
    if !resolved.starts_with(root.canonicalize()?) {
        return Err(error("Path escapes repository"));
    }
    Ok(resolved)
}

pub fn read_bounded(path: &Path, limit: u64) -> Result<String> {
    use std::io::Read;
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(limit + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit as usize {
        return Err(error("Document exceeds size limit"));
    }
    String::from_utf8(bytes).map_err(|_| error("Document is not UTF-8 text"))
}
