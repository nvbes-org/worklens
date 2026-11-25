use crate::{error, service::Service, Result};
use std::{collections::HashMap, net::SocketAddr, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::watch,
};
use worklens_core::{ConfigProfile, Request, Response, PROTOCOL_VERSION};

pub struct HttpServerHandle {
    pub addr: SocketAddr,
    shutdown_tx: watch::Sender<bool>,
}

impl HttpServerHandle {
    pub fn stop(&self) {
        let _ = self.shutdown_tx.send(true);
    }
}

pub async fn start_http_server(
    profile: &ConfigProfile,
    service: Arc<Service>,
) -> Result<HttpServerHandle> {
    let bind_addr = format!(
        "{}:{}",
        profile.transports.api_bind, profile.transports.api_port
    );
    let listener = TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| error(format!("Failed to bind HTTP API to {bind_addr}: {e}")))?;

    let local_addr = listener.local_addr()?;
    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);
    let expected_headers = profile.network.headers.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        break;
                    }
                }
                accept_res = listener.accept() => {
                    match accept_res {
                        Ok((stream, _peer)) => {
                            let s = service.clone();
                            let h = expected_headers.clone();
                            tokio::spawn(async move {
                                let _ = handle_http_connection(stream, s, h).await;
                            });
                        }
                        Err(_) => {
                            tokio::time::sleep(Duration::from_millis(50)).await;
                        }
                    }
                }
            }
        }
    });

    Ok(HttpServerHandle {
        addr: local_addr,
        shutdown_tx,
    })
}

fn handle_request_box(
    service: Arc<Service>,
    req: Request,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Response> + Send>> {
    Box::pin(async move { service.request(req).await })
}

async fn handle_http_connection(
    mut stream: TcpStream,
    service: Arc<Service>,
    expected_headers: HashMap<String, String>,
) -> Result<()> {
    let mut buffer = [0u8; 8192];
    let n = stream.read(&mut buffer).await?;
    if n == 0 {
        return Ok(());
    }

    let request_str = String::from_utf8_lossy(&buffer[..n]).into_owned();
    let (method, path) = {
        let mut lines = request_str.lines();
        let first_line = lines.next().unwrap_or("");
        let mut parts = first_line.split_whitespace();
        let m = parts.next().unwrap_or("").to_string();
        let p = parts.next().unwrap_or("").to_string();
        (m, p)
    };

    let mut headers = HashMap::new();
    let mut body_start = 0;
    for (idx, line) in request_str.lines().enumerate() {
        if idx == 0 {
            continue;
        }
        if line.is_empty() || line == "\r" {
            // End of headers
            if let Some(pos) = request_str.find("\r\n\r\n") {
                body_start = pos + 4;
            } else if let Some(pos) = request_str.find("\n\n") {
                body_start = pos + 2;
            }
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }

    // Verify required custom headers if any are configured
    for (req_k, req_v) in &expected_headers {
        let actual_v = headers.get(&req_k.to_ascii_lowercase());
        if actual_v != Some(req_v) {
            let resp = "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: 39\r\nConnection: close\r\n\r\n{\"error\":\"Invalid or missing headers\"}";
            let _ = stream.write_all(resp.as_bytes()).await;
            return Ok(());
        }
    }

    if method == "GET" && path == "/api/v1/health" {
        let body = serde_json::json!({
            "status": "ok",
            "version": PROTOCOL_VERSION,
            "engine": "worklens"
        })
        .to_string();
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(resp.as_bytes()).await?;
        return Ok(());
    }

    if method == "GET" && path == "/api/v1/events" {
        let header = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\nevent: ping\r\ndata: {\"status\":\"connected\"}\r\n\r\n";
        stream.write_all(header.as_bytes()).await?;
        return Ok(());
    }

    if method == "POST" && path == "/api/v1/request" {
        let body = if body_start > 0 && body_start < request_str.len() {
            request_str[body_start..].to_string()
        } else {
            String::new()
        };
        drop(request_str);
        drop(headers);
        drop(expected_headers);

        let response = match serde_json::from_str::<Request>(&body) {
            Ok(req) => handle_request_box(service, req).await,
            Err(e) => Response::failure(format!("Invalid JSON request: {e}")),
        };

        let res_body = serde_json::to_string(&response)?;
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            res_body.len(),
            res_body
        );
        stream.write_all(resp.as_bytes()).await?;
        return Ok(());
    }

    let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    stream.write_all(not_found.as_bytes()).await?;
    Ok(())
}
