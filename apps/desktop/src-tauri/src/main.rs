use std::sync::Mutex;
use tauri::{Emitter, Manager};
use worklens_core::{Request, Response};
use worklens_runtime::watcher::FileWatcher;

#[derive(Default)]
struct WatcherState {
    watcher: Mutex<Option<FileWatcher>>,
}

#[tauri::command]
async fn query(request: Request) -> Result<Response, String> {
    worklens_runtime::transport::send(&request)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_source(repository: String, path: String, editor: Option<bool>) -> Result<(), String> {
    let validation = worklens_runtime::transport::send(&Request {
        version: worklens_core::PROTOCOL_VERSION,
        operation: worklens_core::Operation::Agents,
        repository: Some(repository.clone()),
        params: serde_json::json!({}),
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(error) = validation.error {
        return Err(error);
    }
    let root = std::path::Path::new(&repository)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let source = worklens_runtime::paths::confined(&root, &path).map_err(|e| e.to_string())?;
    std::process::Command::new("open")
        .arg(if editor == Some(true) { "-t" } else { "-R" })
        .arg(source)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn watch_repository(
    app: tauri::AppHandle,
    state: tauri::State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let root = std::path::PathBuf::from(&path);
    let app_handle = app.clone();
    let watcher = worklens_runtime::watcher::watch(&root, move |events| {
        let _ = app_handle.emit("worklens:file-change", events);
    })
    .map_err(|e| e.to_string())?;

    let mut guard = state.watcher.lock().map_err(|_| "Lock poisoned".to_string())?;
    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
async fn unwatch_repository(state: tauri::State<'_, WatcherState>) -> Result<(), String> {
    let mut guard = state.watcher.lock().map_err(|_| "Lock poisoned".to_string())?;
    *guard = None;
    Ok(())
}

struct TerminalState {
    daemon: std::sync::Arc<aurora_bridge::BridgeDaemon>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            daemon: std::sync::Arc::new(aurora_bridge::BridgeDaemon::new()),
        }
    }
}

#[tauri::command]
async fn terminal_spawn(
    state: tauri::State<'_, TerminalState>,
    cwd: Option<String>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<String, String> {
    let resp = state.daemon.handle_request(aurora_bridge::BridgeRequest::Spawn {
        shell: None,
        cwd,
        rows: rows.unwrap_or(24),
        cols: cols.unwrap_or(80),
    });
    match resp {
        aurora_bridge::BridgeResponse::Spawned { session_id } => Ok(session_id),
        aurora_bridge::BridgeResponse::Error(e) => Err(e),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
async fn terminal_write(
    state: tauri::State<'_, TerminalState>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let resp = state
        .daemon
        .handle_request(aurora_bridge::BridgeRequest::Write { session_id, data });
    match resp {
        aurora_bridge::BridgeResponse::Ok => Ok(()),
        aurora_bridge::BridgeResponse::Error(e) => Err(e),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
async fn terminal_read(
    state: tauri::State<'_, TerminalState>,
    session_id: String,
) -> Result<Vec<u8>, String> {
    let mut buf = [0u8; 4096];
    match state.daemon.read_session_output(&session_id, &mut buf) {
        Ok(n) => Ok(buf[..n].to_vec()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn terminal_resize(
    state: tauri::State<'_, TerminalState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let resp = state
        .daemon
        .handle_request(aurora_bridge::BridgeRequest::Resize {
            session_id,
            rows,
            cols,
        });
    match resp {
        aurora_bridge::BridgeResponse::Ok => Ok(()),
        aurora_bridge::BridgeResponse::Error(e) => Err(e),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
async fn terminal_get_blocks(
    state: tauri::State<'_, TerminalState>,
    session_id: String,
) -> Result<Vec<aurora_blocks::CommandBlock>, String> {
    let resp = state
        .daemon
        .handle_request(aurora_bridge::BridgeRequest::GetBlocks { session_id });
    match resp {
        aurora_bridge::BridgeResponse::Blocks(blocks) => Ok(blocks),
        aurora_bridge::BridgeResponse::Error(e) => Err(e),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
async fn terminal_kill(
    state: tauri::State<'_, TerminalState>,
    session_id: String,
) -> Result<(), String> {
    let resp = state
        .daemon
        .handle_request(aurora_bridge::BridgeRequest::Kill { session_id });
    match resp {
        aurora_bridge::BridgeResponse::Ok => Ok(()),
        aurora_bridge::BridgeResponse::Error(e) => Err(e),
        _ => Err("Unexpected response".to_string()),
    }
}

#[tauri::command]
async fn create_native_window(
    app: tauri::AppHandle,
    id: String,
    title: String,
    url: String,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    always_on_top: Option<bool>,
) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(&id) {
        let _ = existing.set_focus();
        return Ok(());
    }

    let webview_url = tauri::WebviewUrl::App(url.into());
    let mut builder = tauri::WebviewWindowBuilder::new(&app, &id, webview_url)
        .title(&title)
        .inner_size(width.unwrap_or(600.0), height.unwrap_or(450.0))
        .min_inner_size(320.0, 200.0)
        .resizable(true)
        .always_on_top(always_on_top.unwrap_or(false));

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }

    if let (Some(x_pos), Some(y_pos)) = (x, y) {
        builder = builder.position(x_pos, y_pos);
    }

    builder.build().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn close_native_window(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&id) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn set_native_window_always_on_top(
    app: tauri::AppHandle,
    id: String,
    always_on_top: bool,
) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&id) {
        win.set_always_on_top(always_on_top)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn focus_native_window(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&id) {
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    if std::env::args().nth(1).as_deref() == Some("serve") {
        let runtime = tokio::runtime::Runtime::new().expect("Tokio initialization failed");
        if let Err(error) = runtime.block_on(worklens_runtime::transport::serve()) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    tauri::Builder::default()
        .manage(WatcherState::default())
        .manage(TerminalState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|_| {
            let executable = std::env::current_exe()?;
            tauri::async_runtime::block_on(worklens_runtime::transport::ensure(&executable))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            query,
            open_source,
            watch_repository,
            unwatch_repository,
            terminal_spawn,
            terminal_write,
            terminal_read,
            terminal_resize,
            terminal_get_blocks,
            terminal_kill,
            create_native_window,
            close_native_window,
            set_native_window_always_on_top,
            focus_native_window
        ])
        .run(tauri::generate_context!())
        .expect("desktop runtime failed");
}
