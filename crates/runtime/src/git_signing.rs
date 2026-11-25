use crate::{
    Result,
    command::{git, run},
    error,
};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use worklens_core::{SigningStatus, SshKeyInfo};

fn ssh_dir() -> Option<PathBuf> {
    directories::BaseDirs::new().map(|b| b.home_dir().join(".ssh"))
}

pub async fn signing_status(root: &Path) -> Result<SigningStatus> {
    let gpg_sign = git(root, &["config", "--get", "commit.gpgsign"])
        .await
        .map(|s| s.trim() == "true")
        .unwrap_or(false);

    let format = git(root, &["config", "--get", "gpg.format"])
        .await
        .map(|s| s.trim().to_lowercase())
        .unwrap_or_else(|_| "openpgp".to_string());

    let signing_key = git(root, &["config", "--get", "user.signingkey"])
        .await
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let user_name = git(root, &["config", "--get", "user.name"])
        .await
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let user_email = git(root, &["config", "--get", "user.email"])
        .await
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let gpg_available = run(root, "gpg", &["--version"]).await.is_ok();
    let ssh_available = run(root, "ssh-keygen", &["-?"]).await.is_ok()
        || run(root, "ssh", &["-V"]).await.is_ok();

    Ok(SigningStatus {
        gpg_sign,
        format,
        signing_key,
        user_name,
        user_email,
        gpg_available,
        ssh_available,
    })
}

pub async fn signing_config(
    root: &Path,
    gpg_sign: bool,
    format: Option<&str>,
    signing_key: Option<&str>,
) -> Result<Value> {
    git(
        root,
        &[
            "config",
            "commit.gpgsign",
            if gpg_sign { "true" } else { "false" },
        ],
    )
    .await?;

    if let Some(fmt) = format {
        git(root, &["config", "gpg.format", fmt]).await?;
    }

    if let Some(key) = signing_key {
        if key.trim().is_empty() {
            let _ = git(root, &["config", "--unset", "user.signingkey"]).await;
        } else {
            git(root, &["config", "user.signingkey", key.trim()]).await?;
        }
    }

    Ok(json!({ "success": true, "action": "signing_config" }))
}

pub async fn ssh_keys_list(root: &Path) -> Result<Vec<SshKeyInfo>> {
    let current_signing_key = git(root, &["config", "--get", "user.signingkey"])
        .await
        .ok()
        .map(|s| s.trim().to_string());

    let agent_output = run(root, "ssh-add", &["-l"])
        .await
        .map(|o| String::from_utf8_lossy(&o).into_owned())
        .unwrap_or_default();

    let mut keys = Vec::new();
    let ssh_path = match ssh_dir() {
        Some(p) if p.is_dir() => p,
        _ => return Ok(keys),
    };

    let mut read_dir = match tokio::fs::read_dir(&ssh_path).await {
        Ok(d) => d,
        Err(_) => return Ok(keys),
    };

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("pub") {
            let file_stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
            let pub_content = tokio::fs::read_to_string(&path)
                .await
                .unwrap_or_default()
                .trim()
                .to_string();

            if pub_content.is_empty() {
                continue;
            }

            // Fingerprint with ssh-keygen -lf
            let fingerprint_out = run(root, "ssh-keygen", &["-lf", &path.to_string_lossy()])
                .await
                .map(|o| String::from_utf8_lossy(&o).into_owned())
                .unwrap_or_default();

            // Format: 256 SHA256:abcd... comment (ED25519)
            let parts: Vec<&str> = fingerprint_out.split_whitespace().collect();
            let fingerprint = parts.get(1).unwrap_or(&"").to_string();
            let key_type = parts
                .get(3)
                .map(|s| s.trim_matches(|c| c == '(' || c == ')'))
                .unwrap_or(if pub_content.starts_with("ssh-ed25519") {
                    "ED25519"
                } else if pub_content.starts_with("ssh-rsa") {
                    "RSA"
                } else {
                    "SSH"
                })
                .to_string();

            let in_agent = !fingerprint.is_empty() && agent_output.contains(&fingerprint);
            let path_str = path.to_string_lossy().to_string();
            let is_signing_key = current_signing_key.as_ref().map_or(false, |k| {
                k == &path_str || k == &pub_content || pub_content.contains(k)
            });

            keys.push(SshKeyInfo {
                name: file_stem,
                path: path_str,
                public_key: pub_content,
                fingerprint,
                key_type,
                in_agent,
                is_signing_key,
            });
        }
    }

    keys.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(keys)
}

pub async fn ssh_key_generate(
    email: &str,
    name: &str,
    key_type: &str,
    set_as_signing: bool,
    root: &Path,
) -> Result<Value> {
    let clean_name = name
        .trim()
        .replace('/', "")
        .replace('\\', "")
        .replace(' ', "_");
    if clean_name.is_empty() {
        return Err(error("Key name cannot be empty"));
    }

    let ssh_dir = ssh_dir().ok_or_else(|| error("Cannot resolve ~/.ssh directory"))?;
    tokio::fs::create_dir_all(&ssh_dir).await?;

    let key_path = ssh_dir.join(&clean_name);
    let pub_path = ssh_dir.join(format!("{clean_name}.pub"));

    if key_path.exists() {
        return Err(error(format!(
            "Key file already exists at {}",
            key_path.display()
        )));
    }

    let algorithm = match key_type.to_lowercase().as_str() {
        "rsa" => "rsa",
        _ => "ed25519",
    };

    let key_path_str = key_path.to_string_lossy().to_string();
    let email_clean = if email.trim().is_empty() {
        "worklens@local"
    } else {
        email.trim()
    };

    let out = run(
        root,
        "ssh-keygen",
        &[
            "-t",
            algorithm,
            "-C",
            email_clean,
            "-f",
            &key_path_str,
            "-N",
            "",
        ],
    )
    .await?;

    // Try adding to ssh-agent
    let _ = run(root, "ssh-add", &[&key_path_str]).await;

    let pub_content = tokio::fs::read_to_string(&pub_path)
        .await
        .unwrap_or_default()
        .trim()
        .to_string();

    let fingerprint_out = run(root, "ssh-keygen", &["-lf", &pub_path.to_string_lossy()])
        .await
        .map(|o| String::from_utf8_lossy(&o).into_owned())
        .unwrap_or_default();
    let fingerprint = fingerprint_out
        .split_whitespace()
        .nth(1)
        .unwrap_or("")
        .to_string();

    if set_as_signing {
        git(root, &["config", "gpg.format", "ssh"]).await?;
        git(
            root,
            &["config", "user.signingkey", &pub_path.to_string_lossy()],
        )
        .await?;
        git(root, &["config", "commit.gpgsign", "true"]).await?;
    }

    Ok(json!({
        "success": true,
        "action": "ssh_key_generate",
        "name": clean_name,
        "path": key_path_str,
        "publicKey": pub_content,
        "fingerprint": fingerprint,
        "keyType": algorithm.to_uppercase(),
        "output": String::from_utf8_lossy(&out)
    }))
}
