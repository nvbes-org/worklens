use crate::{Result, error, paths::data_dir, service::Service};
use fs2::FileExt;
use std::{
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
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
    let stream = UnixStream::connect(&socket).await?;
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

pub async fn ensure(binary: &Path) -> Result<()> {
    let socket = data_dir()?.join("service.sock");
    if UnixStream::connect(&socket).await.is_ok() {
        return Ok(());
    }
    std::process::Command::new(binary)
        .arg("serve")
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
