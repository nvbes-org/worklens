use crate::{Result, error};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

struct Pending {
    client_id: String,
    device_code: String,
    expires: Instant,
    next_poll: Instant,
    interval: u64,
}

#[cfg(test)]
#[path = "github_auth.tests.rs"]
mod tests;
pub struct Auth {
    endpoint: String,
    pending: Mutex<HashMap<String, Pending>>,
    client: reqwest::Client,
}

impl Default for Auth {
    fn default() -> Self {
        Self {
            endpoint: "https://github.com".into(),
            pending: Mutex::new(HashMap::new()),
            client: reqwest::Client::new(),
        }
    }
}

fn entry() -> Result<keyring::Entry> {
    keyring::Entry::new("dev.worklens.github", "github.com")
        .map_err(|_| error("Cannot access macOS Keychain"))
}
pub fn token() -> Result<String> {
    entry()?
        .get_password()
        .map_err(|_| error("Connect GitHub in Worklens settings"))
}
pub fn status() -> Value {
    json!({ "connected": token().is_ok(), "host": "github.com" })
}
pub fn logout() -> Result<Value> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(json!({ "connected": false })),
        Err(_) => Err(error("Could not remove GitHub credential from Keychain")),
    }
}

impl Auth {
    pub async fn start(&self, client_id: &str) -> Result<Value> {
        if client_id.is_empty() || client_id.len() > 200 {
            return Err(error("Configure the GitHub App client ID in Settings"));
        }
        let response: Value = self
            .client
            .post(format!("{}/login/device/code", self.endpoint))
            .timeout(Duration::from_secs(20))
            .header("Accept", "application/json")
            .form(&[("client_id", client_id)])
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        let device_code = response["device_code"].as_str().ok_or_else(|| {
            error(
                "GitHub did not issue a device code; verify the client ID and enabled Device Flow",
            )
        })?;
        let id = uuid::Uuid::new_v4().to_string();
        let interval = response["interval"].as_u64().unwrap_or(5).max(5);
        let expires = response["expires_in"].as_u64().unwrap_or(900);
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| error("Authorization state unavailable"))?;
        pending.retain(|_, p| p.expires > Instant::now());
        pending.insert(
            id.clone(),
            Pending {
                client_id: client_id.into(),
                device_code: device_code.into(),
                expires: Instant::now() + Duration::from_secs(expires),
                next_poll: Instant::now() + Duration::from_secs(interval),
                interval,
            },
        );
        Ok(
            json!({ "id": id, "userCode": response["user_code"], "verificationUri": "https://github.com/login/device", "interval": interval, "expiresIn": expires }),
        )
    }

    pub async fn poll(&self, id: &str) -> Result<Value> {
        let (client_id, device_code) = {
            let mut entries = self
                .pending
                .lock()
                .map_err(|_| error("Authorization state unavailable"))?;
            let pending = entries
                .get_mut(id)
                .ok_or_else(|| error("Authorization expired; start again"))?;
            if pending.expires <= Instant::now() {
                entries.remove(id);
                return Err(error("Authorization expired; start again"));
            }
            if pending.next_poll > Instant::now() {
                return Ok(json!({ "status": "pending" }));
            }
            pending.next_poll = Instant::now() + Duration::from_secs(pending.interval);
            (pending.client_id.clone(), pending.device_code.clone())
        };
        let response: Value = self
            .client
            .post(format!("{}/login/oauth/access_token", self.endpoint))
            .timeout(Duration::from_secs(20))
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id.as_str()),
                ("device_code", device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        if let Some(token) = response["access_token"].as_str() {
            entry()?
                .set_password(token)
                .map_err(|_| error("Could not save GitHub token in Keychain"))?;
            self.pending
                .lock()
                .map_err(|_| error("Authorization state unavailable"))?
                .remove(id);
            return Ok(json!({ "status": "connected" }));
        }
        match response["error"].as_str() {
            Some("authorization_pending") => Ok(json!({ "status": "pending" })),
            Some("slow_down") => {
                let mut entries = self
                    .pending
                    .lock()
                    .map_err(|_| error("Authorization state unavailable"))?;
                if let Some(p) = entries.get_mut(id) {
                    p.interval += 5;
                    p.next_poll = Instant::now() + Duration::from_secs(p.interval);
                }
                Ok(json!({ "status": "pending" }))
            }
            _ => {
                self.pending
                    .lock()
                    .map_err(|_| error("Authorization state unavailable"))?
                    .remove(id);
                Err(error("GitHub authorization denied or expired; reconnect"))
            }
        }
    }
}
