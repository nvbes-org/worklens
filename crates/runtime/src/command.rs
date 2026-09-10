use crate::{Result, error};
use std::{path::Path, process::Stdio, time::Duration};
use tokio::{io::AsyncReadExt, process::Command};

pub async fn run(root: &Path, program: &str, args: &[&str]) -> Result<Vec<u8>> {
    // Finder launches do not inherit the interactive shell's PATH. Append only
    // conventional user/toolchain locations; never source shell startup scripts.
    let mut search: Vec<_> =
        std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect();
    search.extend(
        ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].map(std::path::PathBuf::from),
    );
    if let Some(home) = directories::BaseDirs::new() {
        search.extend(
            [".cargo/bin", ".local/share/pnpm", ".local/bin"].map(|p| home.home_dir().join(p)),
        );
    }
    let executable_path =
        std::env::join_paths(search).map_err(|_| error("Invalid executable search path"))?;
    let mut child = Command::new(program)
        .args(args)
        .current_dir(root)
        .env("PATH", executable_path)
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("RUSTUP_AUTO_INSTALL", "0")
        .env("COREPACK_ENABLE_NETWORK", "0")
        .env("COREPACK_ENABLE_DOWNLOAD_PROMPT", "0")
        .env("npm_config_manage_package_manager_versions", "false")
        .env("NX_DAEMON", "false")
        .env("NX_INTERACTIVE", "false")
        .env("NX_NO_CLOUD", "true")
        .env("NX_SKIP_NX_CACHE", "true")
        .env(
            "NX_WORKSPACE_DATA_DIRECTORY",
            crate::paths::data_dir()?
                .join("nx-workspace-data")
                .join(worklens_core::stable_id("path", &root.to_string_lossy()).replace(':', "-")),
        )
        .env(
            "NX_CACHE_DIRECTORY",
            crate::paths::data_dir()?.join("nx-cache"),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| error("Missing command stdout"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| error("Missing command stderr"))?;
    tokio::time::timeout(Duration::from_secs(90), async {
        let out = async {
            let mut v = Vec::new();
            stdout.take(16_000_001).read_to_end(&mut v).await?;
            Ok::<_, std::io::Error>(v)
        };
        let err = async {
            let mut v = Vec::new();
            stderr.take(1_000_001).read_to_end(&mut v).await?;
            Ok::<_, std::io::Error>(v)
        };
        let (out, err) = tokio::try_join!(out, err)?;
        // Stop rather than deadlock waiting on a producer exceeding either pipe limit.
        if out.len() > 16_000_000 || err.len() > 1_000_000 {
            child.kill().await?;
            return Err(error("Command output exceeds collection limit"));
        }
        let status = child.wait().await?;
        if !status.success() {
            return Err(error(format!(
                "{program} failed ({}): {}",
                status,
                String::from_utf8_lossy(&err)
                    .chars()
                    .take(1500)
                    .collect::<String>()
            )));
        }
        Ok(out)
    })
    .await
    .map_err(|_| error(format!("{program} timed out after 90 seconds")))?
}

pub async fn git(root: &Path, args: &[&str]) -> Result<String> {
    let mut safe = vec![
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.quotePath=false",
        "--no-pager",
    ];
    safe.extend_from_slice(args);
    Ok(String::from_utf8_lossy(&run(root, "git", &safe).await?).into_owned())
}
