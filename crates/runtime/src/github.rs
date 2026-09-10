use crate::{Result, error};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use worklens_core::{Operation, Provenance};

struct Cached {
    etag: Option<String>,
    data: Value,
}

#[cfg(test)]
#[path = "github_impact.tests.rs"]
mod impact_tests;
#[cfg(test)]
#[path = "github.tests.rs"]
mod tests;
pub struct Github {
    api_base: String,
    #[cfg(test)]
    test_token: Option<String>,
    client: reqwest::Client,
    cache: Mutex<HashMap<String, Cached>>,
    retry: Mutex<Option<Instant>>,
}

impl Default for Github {
    fn default() -> Self {
        Self {
            api_base: "https://api.github.com".into(),
            #[cfg(test)]
            test_token: None,
            client: reqwest::Client::builder()
                .user_agent("worklens/0.1.0-alpha.1")
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .expect("static HTTP client configuration"),
            cache: Mutex::new(HashMap::new()),
            retry: Mutex::new(None),
        }
    }
}

pub fn slug(remote: &str) -> Option<String> {
    let path = remote
        .strip_prefix("git@github.com:")
        .or_else(|| remote.strip_prefix("https://github.com/"))
        .or_else(|| remote.strip_prefix("ssh://git@github.com/"))?;
    let path = path.trim_end_matches('/').trim_end_matches(".git");
    valid_slug(path).then(|| path.into())
}

pub fn valid_slug(value: &str) -> bool {
    let parts: Vec<_> = value.split('/').collect();
    parts.len() == 2
        && parts.iter().all(|p| {
            !p.is_empty()
                && *p != "."
                && *p != ".."
                && p.bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
        })
}

impl Github {
    fn credential(&self) -> Result<String> {
        #[cfg(test)]
        if let Some(token) = &self.test_token {
            return Ok(token.clone());
        }
        crate::github_auth::token()
    }
    pub fn clear(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear();
        }
    }

    pub async fn get(&self, endpoint: &str) -> Result<Value> {
        if self
            .retry
            .lock()
            .map_err(|_| error("GitHub state unavailable"))?
            .is_some_and(|t| t > Instant::now())
        {
            return Err(error("GitHub rate limit reached; retry is deferred"));
        }
        let token = self.credential()?;
        let mut request = self
            .client
            .get(format!("{}{endpoint}", self.api_base))
            .timeout(Duration::from_secs(25))
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28");
        {
            let cache = self
                .cache
                .lock()
                .map_err(|_| error("GitHub cache unavailable"))?;
            if let Some(etag) = cache.get(endpoint).and_then(|c| c.etag.as_ref()) {
                request = request.header("If-None-Match", etag);
            }
        }
        let response = request.send().await?;
        let status = response.status();
        if status.as_u16() == 304 {
            return self
                .cache
                .lock()
                .map_err(|_| error("GitHub cache unavailable"))?
                .get(endpoint)
                .map(|c| c.data.clone())
                .ok_or_else(|| error("GitHub returned 304 without cached data"));
        }
        if status.as_u16() == 401 {
            return Err(error("GitHub authorization expired; reconnect in Settings"));
        }
        if status.as_u16() == 429
            || (status.as_u16() == 403
                && (response.headers().contains_key("retry-after")
                    || response
                        .headers()
                        .get("x-ratelimit-remaining")
                        .is_some_and(|v| v == "0")))
        {
            let seconds = response
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .or_else(|| {
                    response
                        .headers()
                        .get("x-ratelimit-reset")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|v| v.parse::<i64>().ok())
                        .map(|epoch| (epoch - chrono::Utc::now().timestamp()).max(1) as u64)
                })
                .unwrap_or(60);
            *self
                .retry
                .lock()
                .map_err(|_| error("GitHub state unavailable"))? =
                Some(Instant::now() + Duration::from_secs(seconds.min(86400)));
            return Err(error("GitHub rate limit reached; automatic retry deferred"));
        }
        if !status.is_success() {
            return Err(error(format!(
                "GitHub returned {status}; check app installation and repository permissions"
            )));
        }
        let etag = response
            .headers()
            .get("etag")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        if response.content_length().is_some_and(|n| n > 8_000_000) {
            return Err(error("GitHub response exceeds size limit"));
        }
        let mut response = response;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if bytes.len() + chunk.len() > 8_000_000 {
                return Err(error("GitHub response exceeds size limit"));
            }
            bytes.extend_from_slice(&chunk);
        }
        let data: Value = serde_json::from_slice(&bytes)?;
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| error("GitHub cache unavailable"))?;
        if cache.len() >= 200 {
            cache.clear();
        }
        cache.insert(
            endpoint.into(),
            Cached {
                etag,
                data: data.clone(),
            },
        );
        Ok(data)
    }

    pub async fn query(&self, repo: &str, operation: &Operation, params: &Value) -> Result<Value> {
        if !valid_slug(repo) {
            return Err(error("Select a GitHub owner/repository"));
        }
        let base = format!("/repos/{repo}");
        let page = params["page"].as_u64().unwrap_or(1).clamp(1, 10_000);
        let number = params["number"].as_u64().unwrap_or(0);
        let state = match params["state"].as_str() {
            Some("closed") => "closed",
            Some("all") => "all",
            _ => "open",
        };
        let suffix = format!("per_page=30&page={page}");
        let data = match operation {
            Operation::Issues => {
                self.get(&format!("{base}/issues?state={state}&{suffix}"))
                    .await?
            }
            Operation::Prs => {
                self.get(&format!("{base}/pulls?state={state}&{suffix}"))
                    .await?
            }
            Operation::Ci => self.get(&format!("{base}/actions/runs?{suffix}")).await?,
            Operation::Pr if number > 0 => {
                let pr = self.get(&format!("{base}/pulls/{number}")).await?;
                let sha = pr["head"]["sha"]
                    .as_str()
                    .ok_or_else(|| error("PR head SHA missing"))?;
                if !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
                    return Err(error("Invalid GitHub commit SHA"));
                }
                let (files, reviews, comments, review_comments, checks, statuses, runs) = tokio::join!(
                    self.section(format!("{base}/pulls/{number}/files?{suffix}")),
                    self.section(format!("{base}/pulls/{number}/reviews?{suffix}")),
                    self.section(format!("{base}/issues/{number}/comments?{suffix}")),
                    self.section(format!("{base}/pulls/{number}/comments?{suffix}")),
                    self.section(format!("{base}/commits/{sha}/check-runs?{suffix}")),
                    self.section(format!("{base}/commits/{sha}/status?{suffix}")),
                    self.section(format!("{base}/actions/runs?head_sha={sha}&{suffix}"))
                );
                json!({ "pr": pr, "files": files, "reviews": reviews, "comments": comments, "review_comments": review_comments, "checks": checks, "statuses": statuses, "runs": runs })
            }
            Operation::Issue if number > 0 => {
                let issue = self.get(&format!("{base}/issues/{number}")).await?;
                let comments = self
                    .section(format!("{base}/issues/{number}/comments?{suffix}"))
                    .await;
                let timeline = self
                    .section(format!("{base}/issues/{number}/timeline?{suffix}"))
                    .await;
                json!({ "issue": issue, "comments": comments, "timeline": timeline })
            }
            Operation::Run if number > 0 => {
                let run = self.get(&format!("{base}/actions/runs/{number}")).await?;
                let jobs = self
                    .section(format!("{base}/actions/runs/{number}/jobs?{suffix}"))
                    .await;
                let artifacts = self
                    .section(format!("{base}/actions/runs/{number}/artifacts?{suffix}"))
                    .await;
                json!({ "run": run, "jobs": jobs, "artifacts": artifacts })
            }
            Operation::Logs if number > 0 => self.logs(&base, number).await?,
            _ => {
                return Err(error(
                    "A positive number is required for this GitHub operation",
                ));
            }
        };
        Ok(
            json!({ "data": data, "page": page, "perPage": 30, "provenance": Provenance::observed(&format!("GitHub {repo}")) }),
        )
    }

    async fn section(&self, endpoint: String) -> Value {
        match self.get(&endpoint).await {
            Ok(data) => json!({ "data": data, "error": null }),
            Err(e) => json!({ "data": null, "error": e.to_string() }),
        }
    }

    async fn logs(&self, base: &str, job: u64) -> Result<Value> {
        let response = self
            .client
            .get(format!("{}{base}/actions/jobs/{job}/logs", self.api_base))
            .bearer_auth(self.credential()?)
            .timeout(Duration::from_secs(25))
            .send()
            .await?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| error("GitHub logs redirect missing"))?;
            let url = reqwest::Url::parse(location).map_err(|_| error("Invalid logs URL"))?;
            if url.scheme() != "https" {
                return Err(error("Invalid logs transport"));
            }
            // A fresh unauthenticated client avoids leaking the GitHub token to blob storage.
            let mut logs = reqwest::Client::new()
                .get(url)
                .timeout(Duration::from_secs(25))
                .send()
                .await?
                .error_for_status()?;
            let mut bytes = Vec::new();
            let mut truncated = false;
            while let Some(chunk) = logs.chunk().await? {
                let remaining = 256_000usize.saturating_sub(bytes.len());
                bytes.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
                if chunk.len() > remaining {
                    truncated = true;
                    break;
                }
            }
            return Ok(json!({ "text": String::from_utf8_lossy(&bytes), "truncated": truncated }));
        }
        Err(error(format!(
            "Job logs unavailable ({})",
            response.status()
        )))
    }
}
