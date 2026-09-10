use worklens_core::{Request, Response};

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|_| {
            let executable = std::env::current_exe()?;
            tauri::async_runtime::block_on(worklens_runtime::transport::ensure(&executable))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![query, open_source])
        .run(tauri::generate_context!())
        .expect("desktop runtime failed");
}
