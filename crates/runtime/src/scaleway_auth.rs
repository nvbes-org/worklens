use crate::{error, Result};
use serde_json::{json, Value};

const KEYCHAIN_SERVICE: &str = "dev.worklens.scaleway";
const KEYCHAIN_USER: &str = "api.scaleway.com";

fn entry() -> Result<keyring::Entry> {
    keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)
        .map_err(|_| error("Cannot access macOS Keychain for Scaleway credentials"))
}

pub fn token() -> Result<(String, &'static str)> {
    if let Ok(ent) = entry() {
        if let Ok(secret) = ent.get_password() {
            if !secret.is_empty() {
                return Ok((secret, "keychain"));
            }
        }
    }

    if let Ok(env_key) = std::env::var("SCW_SECRET_KEY") {
        if !env_key.is_empty() {
            return Ok((env_key, "env"));
        }
    }

    Err(error(
        "No Scaleway Secret Key configured in Keychain or SCW_SECRET_KEY",
    ))
}

pub fn set_token(secret_key: &str) -> Result<()> {
    let clean = secret_key.trim();
    if clean.is_empty() {
        return Err(error("Scaleway Secret Key cannot be empty"));
    }
    entry()?
        .set_password(clean)
        .map_err(|e| error(format!("Failed to save Scaleway key in Keychain: {e}")))?;
    Ok(())
}

pub fn logout() -> Result<Value> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(json!({ "connected": false })),
        Err(_) => Err(error("Could not remove Scaleway credential from Keychain")),
    }
}

pub fn status() -> Value {
    match token() {
        Ok((_, source)) => json!({ "connected": true, "source": source }),
        Err(_) => json!({ "connected": false, "source": "none" }),
    }
}
