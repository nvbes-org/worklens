use crate::{Error, Result};
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::HashSet,
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::sync::mpsc;
use worklens_core::{FileChangeEvent, FileChangeKind};

pub fn should_ignore(path: &Path) -> bool {
    for component in path.components() {
        if let Component::Normal(c) = component {
            let s = c.to_string_lossy();
            if s == ".git"
                || s == "node_modules"
                || s == "target"
                || s == ".nx"
                || s == ".turbo"
                || s == "dist"
                || s == "build"
                || s == ".worklens"
                || s == ".DS_Store"
                || s.starts_with(".#")
                || s.ends_with('~')
                || s.ends_with(".tmp")
                || s.ends_with(".swp")
            {
                return true;
            }
        }
    }
    false
}

fn map_event_kind(kind: &EventKind) -> FileChangeKind {
    match kind {
        EventKind::Create(_) => FileChangeKind::Created,
        EventKind::Modify(_) => FileChangeKind::Modified,
        EventKind::Remove(_) => FileChangeKind::Deleted,
        _ => FileChangeKind::Other,
    }
}

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
    stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl Drop for FileWatcher {
    fn drop(&mut self) {
        if let Some(stop) = self.stop_tx.take() {
            let _ = stop.send(());
        }
    }
}

pub fn watch<F>(root: &Path, on_events: F) -> Result<FileWatcher>
where
    F: Fn(Vec<FileChangeEvent>) + Send + Sync + 'static,
{
    let canonical_root = root
        .canonicalize()
        .map_err(|e| Error::Message(format!("Invalid root path: {e}")))?;

    let (raw_tx, mut raw_rx) = mpsc::unbounded_channel::<Event>();

    let mut watcher = RecommendedWatcher::new(
        move |res: std::result::Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let _ = raw_tx.send(event);
            }
        },
        Config::default(),
    )
    .map_err(|e| Error::Message(format!("Watcher initialization failed: {e}")))?;

    watcher
        .watch(&canonical_root, RecursiveMode::Recursive)
        .map_err(|e| Error::Message(format!("Failed to watch directory: {e}")))?;

    let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
    let root_buf = canonical_root.clone();
    let on_events = Arc::new(on_events);

    tokio::spawn(async move {
        let mut buffer: Vec<FileChangeEvent> = Vec::new();
        let mut seen_paths: HashSet<(PathBuf, FileChangeKind)> = HashSet::new();
        let debounce_duration = Duration::from_millis(150);
        let mut timer = Box::pin(tokio::time::sleep(debounce_duration));
        let mut timer_active = false;

        loop {
            tokio::select! {
                _ = &mut stop_rx => {
                    break;
                }
                event_opt = raw_rx.recv() => {
                    match event_opt {
                        Some(event) => {
                            let kind = map_event_kind(&event.kind);
                            let now = worklens_core::now();
                            for path in event.paths {
                                if should_ignore(&path) {
                                    continue;
                                }
                                let relative = path
                                    .strip_prefix(&root_buf)
                                    .unwrap_or(&path)
                                    .to_string_lossy()
                                    .to_string();

                                if relative.is_empty() {
                                    continue;
                                }

                                if seen_paths.insert((path.clone(), kind.clone())) {
                                    buffer.push(FileChangeEvent {
                                        path: path.to_string_lossy().to_string(),
                                        relative_path: relative,
                                        kind: kind.clone(),
                                        timestamp: now.clone(),
                                    });
                                }
                            }
                            if !buffer.is_empty() && !timer_active {
                                timer = Box::pin(tokio::time::sleep(debounce_duration));
                                timer_active = true;
                            }
                        }
                        None => break,
                    }
                }
                _ = &mut timer, if timer_active => {
                    timer_active = false;
                    if !buffer.is_empty() {
                        let batch = std::mem::take(&mut buffer);
                        seen_paths.clear();
                        on_events(batch);
                    }
                }
            }
        }
    });

    Ok(FileWatcher {
        _watcher: watcher,
        stop_tx: Some(stop_tx),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[test]
    fn test_should_ignore() {
        assert!(should_ignore(Path::new("/repo/.git/HEAD")));
        assert!(should_ignore(Path::new(
            "/repo/node_modules/foo/package.json"
        )));
        assert!(should_ignore(Path::new("/repo/target/debug/build")));
        assert!(should_ignore(Path::new("/repo/.nx/cache")));
        assert!(should_ignore(Path::new("/repo/.DS_Store")));
        assert!(should_ignore(Path::new("/repo/src/file.rs~")));
        assert!(should_ignore(Path::new("/repo/src/.#file.rs")));
        assert!(!should_ignore(Path::new("/repo/src/main.rs")));
        assert!(!should_ignore(Path::new("/repo/README.md")));
        assert!(!should_ignore(Path::new(
            "/repo/packages/core/src/index.ts"
        )));
    }

    #[tokio::test]
    async fn test_watch_detects_created_file() {
        let temp_dir = tempfile::tempdir().unwrap();
        let received = Arc::new(AtomicBool::new(false));
        let received_clone = received.clone();

        let _watcher = watch(temp_dir.path(), move |events| {
            if events.iter().any(|e| e.relative_path.contains("test.txt")) {
                received_clone.store(true, Ordering::SeqCst);
            }
        })
        .unwrap();

        // Create a file
        let file_path = temp_dir.path().join("test.txt");
        std::fs::write(&file_path, "hello").unwrap();

        // Wait up to 2 seconds for event
        for _ in 0..20 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            if received.load(Ordering::SeqCst) {
                break;
            }
        }

        assert!(
            received.load(Ordering::SeqCst),
            "Expected file creation event to be captured"
        );
    }
}
