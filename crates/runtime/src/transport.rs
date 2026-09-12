use crate::{Result, error, paths::data_dir, service::Service};
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
    let service = Arc::new(Service::new(&data.join("worklens.sqlite3"))?);
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
        Err(_) => Response::failure("Invalid request"),
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
    let socket = data_dir()?.join("service.sock");
    if UnixStream::connect(&socket).await.is_ok() {
        return Ok(());
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
                drop(UnixListener::bind(&socket).unwrap());
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
        drop(listener);
        let result = connect_or_start(&socket, async { Err(error("startup failed")) }).await;
        assert!(result.unwrap_err().to_string().contains("startup failed"));
    }
}
