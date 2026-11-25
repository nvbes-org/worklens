use crate::{error, paths::data_dir, service::Service, Result};
use fs2::FileExt;
use std::{
    os::unix::{
        fs::{OpenOptionsExt, PermissionsExt},
        process::CommandExt,
    },
    path::Path,
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::{UnixListener, UnixStream},
};
use worklens_core::{Request, Response};

const MAX_FRAME: u64 = 16_000_000;

pub async fn serve() -> Result<()> {
    let data = data_dir()?;
    let lock = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .mode(0o600)
        .open(data.join("service.lock"))?;
    if lock.try_lock_exclusive().is_err() {
        return Ok(());
    }
    let socket = data.join("service.sock");
    if socket.exists() {
        std::fs::remove_file(&socket)?;
    }
    let listener = UnixListener::bind(&socket)?;
    std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600))?;
    let meta_path = data.join("service.meta");
    let current_mtime = std::env::current_exe()
        .ok()
        .and_then(|p| p.metadata().ok())
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let meta = serde_json::json!({
        "pid": std::process::id(),
        "mtime": current_mtime,
        "version": worklens_core::PROTOCOL_VERSION,
    });
    let _ = std::fs::write(&meta_path, meta.to_string());

    let service = Arc::new(Service::new(&data.join("worklens.lilia"))?);
    service.transports.set_service(Arc::downgrade(&service));
    if let Ok(active_profile) = service.db().and_then(|db| db.get_active_config_profile()) {
        let profile = active_profile.clone();
        let _ = service.transports.reconfigure(&profile).await;
    }
    let semaphore = Arc::new(tokio::sync::Semaphore::new(16));
    loop {
        let (stream, _) = listener.accept().await?;
        let permit = semaphore
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| error("Service is shutting down"))?;
        let service = service.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let _ = tokio::time::timeout(Duration::from_secs(120), handle(stream, service)).await;
        });
    }
}

async fn handle(stream: UnixStream, service: Arc<Service>) -> Result<()> {
    let (read, mut write) = stream.into_split();
    let mut reader = BufReader::new(read.take(MAX_FRAME + 1));
    let mut bytes = Vec::new();
    reader.read_until(b'\n', &mut bytes).await?;
    if bytes.len() as u64 > MAX_FRAME {
        return Err(error("Request exceeds frame limit"));
    }
    let response = match serde_json::from_slice::<Request>(&bytes) {
        Ok(request) => service.request(request).await,
        Err(e) => Response::failure(format!("Invalid request: {e}")),
    };
    write.write_all(&serde_json::to_vec(&response)?).await?;
    write.write_all(b"\n").await?;
    Ok(())
}

pub async fn send(request: &Request) -> Result<Response> {
    let socket = data_dir()?.join("service.sock");
    let stream =
        connect_or_start(&socket, async { ensure(&std::env::current_exe()?).await }).await?;
    let (read, mut write) = stream.into_split();
    write.write_all(&serde_json::to_vec(request)?).await?;
    write.write_all(b"\n").await?;
    let mut reader = BufReader::new(read.take(MAX_FRAME + 1));
    let mut bytes = Vec::new();
    tokio::time::timeout(
        Duration::from_secs(120),
        reader.read_until(b'\n', &mut bytes),
    )
    .await
    .map_err(|_| error("Local service timed out"))??;
    if bytes.len() as u64 > MAX_FRAME {
        return Err(error("Response exceeds frame limit"));
    }
    Ok(serde_json::from_slice(&bytes)?)
}

// Recover only before sending bytes. Replaying after a write could duplicate a mutation.
async fn connect_or_start(
    socket: &Path,
    start: impl std::future::Future<Output = Result<()>>,
) -> Result<UnixStream> {
    match UnixStream::connect(socket).await {
        Ok(stream) => Ok(stream),
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::NotFound | std::io::ErrorKind::ConnectionRefused
            ) =>
        {
            start.await?;
            Ok(UnixStream::connect(socket).await?)
        }
        Err(error) => Err(error.into()),
    }
}

pub async fn ensure(binary: &Path) -> Result<()> {
    let data = data_dir()?;
    let socket = data.join("service.sock");
    let meta_path = data.join("service.meta");

    if UnixStream::connect(&socket).await.is_ok() {
        let is_stale = if let Ok(content) = std::fs::read_to_string(&meta_path) {
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
                let meta_mtime = meta["mtime"].as_u64().unwrap_or(0);
                let meta_version = meta["version"].as_u64().unwrap_or(0);
                let bin_mtime = binary
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                meta_version != worklens_core::PROTOCOL_VERSION as u64
                    || (bin_mtime > 0 && meta_mtime > 0 && bin_mtime > meta_mtime + 2)
            } else {
                false
            }
        } else {
            false
        };

        if !is_stale {
            return Ok(());
        }

        if let Ok(content) = std::fs::read_to_string(&meta_path) {
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(pid) = meta["pid"].as_u64() {
                    let _ = std::process::Command::new("kill")
                        .args(["-TERM", &pid.to_string()])
                        .status();
                    for _ in 0..10 {
                        tokio::time::sleep(Duration::from_millis(50)).await;
                        if UnixStream::connect(&socket).await.is_err() {
                            break;
                        }
                    }
                }
            }
        }
        let _ = std::fs::remove_file(&socket);
    }

    std::process::Command::new(binary)
        .arg("serve")
        .process_group(0)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()?;
    for _ in 0..100 {
        if UnixStream::connect(&socket).await.is_ok() {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    Err(error("Could not start local Worklens service"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reconnects_missing_and_stale_sockets_before_dispatch() {
        let dir = tempfile::tempdir().unwrap();
        let socket = dir.path().join("service.sock");
        for stale in [false, true] {
            if stale {
                drop(std::os::unix::net::UnixListener::bind(&socket).unwrap());
            }
            let mut listener = None;
            let stream = connect_or_start(&socket, async {
                if socket.exists() {
                    std::fs::remove_file(&socket)?;
                }
                listener = Some(UnixListener::bind(&socket)?);
                Ok(())
            })
            .await
            .unwrap();
            assert!(listener.is_some());
            drop(stream);
            drop(listener);
            std::fs::remove_file(&socket).unwrap();
        }
    }

    #[tokio::test]
    async fn live_service_is_reused_and_start_failure_is_returned() {
        let dir = tempfile::tempdir().unwrap();
        let socket = dir.path().join("service.sock");
        let listener = UnixListener::bind(&socket).unwrap();
        let stream = connect_or_start(&socket, async { panic!("live service must not restart") })
            .await
            .unwrap();
        drop(stream);
        drop(listener.into_std().unwrap());
        let result = connect_or_start(&socket, async { Err(error("startup failed")) }).await;
        assert!(result.unwrap_err().to_string().contains("startup failed"));
    }
}
