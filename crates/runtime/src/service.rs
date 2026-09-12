use crate::{Result, error, storage::Store};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use worklens_core::*;

pub struct Service {
    pub(crate) contexts: Mutex<crate::context_snapshot::ContextSnapshots>,
    pub store: Mutex<Store>,
    pub auth: crate::github_auth::Auth,
    pub github: crate::github::Github,
    pub agent_lock: tokio::sync::Mutex<()>,
}

pub fn text<'a>(params: &'a Value, key: &str) -> Result<&'a str> {
    params[key]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 8192)
        .ok_or_else(|| error(format!("Missing or invalid {key}")))
}

impl Service {
    pub fn new(path: &Path) -> Result<Self> {
        Ok(Self {
            contexts: Default::default(),
            store: Mutex::new(Store::open(path)?),
            auth: Default::default(),
            github: Default::default(),
            agent_lock: tokio::sync::Mutex::new(()),
        })
    }
    pub fn db(&self) -> Result<std::sync::MutexGuard<'_, Store>> {
        self.store.lock().map_err(|_| error("Storage unavailable"))
    }

    pub async fn request(&self, request: Request) -> Response {
        if request.version != PROTOCOL_VERSION {
            return Response::failure(
                "Protocol version mismatch; restart Worklens and update all clients",
            );
        }
        match self.dispatch(&request).await {
            Ok(value) => Response::success(value),
            Err(error) => Response::failure(error),
        }
    }

    pub async fn repo(&self, request: &Request) -> Result<Repository> {
        let raw = request
            .repository
            .as_deref()
            .ok_or_else(|| error("Select a repository"))?;
        let path = Path::new(raw).canonicalize()?;
        let mut repo = crate::git::repository(&path, false).await?;
        repo.trusted = self
            .db()?
            .setting(&format!("trust:{}", repo.path))?
            .as_deref()
            == Some("true");
        if !matches!(request.operation, Operation::Open) && !self.db()?.registered(&repo.path)? {
            return Err(error("Open this repository in Worklens first"));
        }
        Ok(repo)
    }

    pub async fn graph(&self, repo: &Repository, refresh: bool) -> Result<Graph> {
        let key = format!("graph:{}", repo.path);
        if !refresh && let Some(value) = self.db()?.cache(&key)? {
            let mut graph: Graph = serde_json::from_value(value)?;
            crate::catalog_workspace::filter_cached(Path::new(&repo.path), &mut graph)?;
            graph.components = worklens_core::graph_components::detect(&graph);
            for source in &mut graph.sources {
                if source.status == Availability::Available {
                    source.status = Availability::Stale;
                }
            }
            return Ok(graph);
        }
        let graph = crate::catalog::collect(repo).await?;
        self.db()?.put_cache(&key, &serde_json::to_value(&graph)?)?;
        Ok(graph)
    }

    async fn dispatch(&self, request: &Request) -> Result<Value> {
        let p = &request.params;
        match &request.operation {
            Operation::Recent => return Ok(serde_json::to_value(self.db()?.recent()?)?),
            Operation::Doctor => return self.doctor().await,
            Operation::GithubAuthStatus => {
                return Ok(
                    json!({ "connected": crate::github_auth::token().is_ok(), "clientId": self.db()?.setting("github_client_id")? }),
                );
            }
            Operation::GithubAuthStart => {
                let client_id = text(p, "clientId")?;
                self.db()?.set("github_client_id", client_id)?;
                return self.auth.start(client_id).await;
            }
            Operation::GithubAuthPoll => {
                let result = self.auth.poll(text(p, "id")?).await?;
                if result["status"] == "connected" {
                    self.github.clear();
                }
                return Ok(result);
            }
            Operation::GithubLogout => {
                self.github.clear();
                return crate::github_auth::logout();
            }
            _ => {}
        }
        let repo = self.repo(request).await?;
        let root = Path::new(&repo.path);
        match &request.operation {
            Operation::Open => {
                self.db()?.remember(&repo)?;
                Ok(serde_json::to_value(repo)?)
            }
            Operation::Trust => {
                let trusted = p["trusted"]
                    .as_bool()
                    .ok_or_else(|| error("trusted must be a boolean"))?;
                self.db()?.set(
                    &format!("trust:{}", repo.path),
                    if trusted { "true" } else { "false" },
                )?;
                let repo = Repository { trusted, ..repo };
                self.db()?.remember(&repo)?;
                Ok(serde_json::to_value(repo)?)
            }
            Operation::Status | Operation::Git => {
                let snapshot = crate::git::snapshot(
                    repo,
                    p["offset"].as_u64().unwrap_or(0).min(100_000) as u32,
                )
                .await?;
                Ok(serde_json::to_value(snapshot)?)
            }
            Operation::Diff => Ok(serde_json::to_value(
                crate::git::diff(
                    root,
                    p["path"].as_str(),
                    p["base"].as_str(),
                    p["head"].as_str(),
                    p["staged"].as_bool().unwrap_or(false),
                )
                .await?,
            )?),
            Operation::Projects | Operation::Graph => Ok(serde_json::to_value(
                self.graph(&repo, p["refresh"].as_bool().unwrap_or(false))
                    .await?,
            )?),
            Operation::Tasks => {
                if !repo.trusted {
                    return Err(error("Trust this repository before executing Nx"));
                }
                crate::catalog_nx::tasks(root, text(p, "project")?, text(p, "target")?).await
            }
            Operation::Impact => {
                let graph = self.graph(&repo, false).await?;
                let paths: Vec<String> = if let Some(paths) = p["paths"].as_array() {
                    paths
                        .iter()
                        .filter_map(|p| p.as_str().map(str::to_owned))
                        .collect()
                } else {
                    crate::git::snapshot(repo, 0)
                        .await?
                        .changes
                        .into_iter()
                        .map(|c| c.path)
                        .collect()
                };
                Ok(serde_json::to_value(worklens_core::impact(&graph, &paths))?)
            }
            Operation::PrImpact => crate::service_impact::collect(self, &repo, p).await,
            Operation::Validations => crate::service_validations::collect(self, &repo, p).await,
            Operation::Documents => Ok(serde_json::to_value(crate::documents::list(root).await?)?),
            Operation::Document => Ok(
                json!({ "path": text(p, "path")?, "text": crate::documents::read(root, text(p, "path")?).await?, "provenance": Provenance::observed("repository documentation") }),
            ),
            Operation::Context => crate::service_context::context(self, &repo, p).await,
            Operation::WorkContext => crate::work_context::collect(self, &repo, p).await,
            Operation::WorkContextPage => {
                let params: WorkContextPageRequest = serde_json::from_value(p.clone())?;
                Ok(serde_json::to_value(
                    self.contexts
                        .lock()
                        .map_err(|_| error("Context storage unavailable"))?
                        .page(&repo, &params)?,
                )?)
            }
            Operation::Search => {
                crate::service_context::search(self, &repo, text(p, "query")?).await
            }
            Operation::Agents => Ok(serde_json::to_value(self.db()?.agents(&repo.id)?)?),
            Operation::WorkList
            | Operation::WorkShow
            | Operation::WorkCreate
            | Operation::WorkUpdate
            | Operation::WorkLink
            | Operation::WorkUnlink
            | Operation::WorkNote
            | Operation::WorkExpectations
            | Operation::WorkDecisionRequest
            | Operation::WorkDecisionAnswer
            | Operation::WorkDecisionCancel => {
                crate::service_work::dispatch(self, &repo, &request.operation, p).await
            }
            Operation::AgentStart
            | Operation::AgentUpdate
            | Operation::AgentHeartbeat
            | Operation::AgentFinish => {
                crate::service_agents::apply(self, &repo, &request.operation, p).await
            }
            Operation::Issues
            | Operation::Prs
            | Operation::Pr
            | Operation::Issue
            | Operation::Ci
            | Operation::Run
            | Operation::Logs => {
                let slug = if let Some(slug) = p["slug"].as_str() {
                    slug.to_owned()
                } else {
                    let snapshot = crate::git::snapshot(repo, 0).await?;
                    let name = p["remote"].as_str().unwrap_or("origin");
                    snapshot
                        .remotes
                        .iter()
                        .find(|r| r.name == name)
                        .and_then(|r| crate::github::slug(&r.url))
                        .ok_or_else(|| error("No GitHub remote; specify slug owner/repository"))?
                };
                let key = format!("github:{slug}:{:?}:{}", request.operation, p);
                match self.github.query(&slug, &request.operation, p).await {
                    Ok(data) => {
                        if !matches!(request.operation, Operation::Logs) {
                            self.db()?.put_cache(&key, &data)?;
                        }
                        Ok(data)
                    }
                    Err(failure) => {
                        if !matches!(request.operation, Operation::Logs)
                            && let Some(mut cached) = self.db()?.cache(&key)?
                        {
                            cached["provenance"]["status"] = json!("stale");
                            cached["provenance"]["detail"] = json!(failure.to_string());
                            return Ok(cached);
                        }
                        Err(failure)
                    }
                }
            }
            _ => Err(error("Operation is not valid in repository context")),
        }
    }

    async fn doctor(&self) -> Result<Value> {
        let mut tools = Vec::new();
        for tool in ["git", "node", "pnpm", "cargo"] {
            let output = crate::command::run(&PathBuf::from("/"), tool, &["--version"]).await;
            let available = output.is_ok();
            let version = output
                .map(|v| String::from_utf8_lossy(&v).trim().to_owned())
                .unwrap_or_else(|e| e.to_string());
            tools.push(ToolStatus {
                tool: tool.into(),
                available,
                version,
            });
        }
        Ok(
            json!({ "tools": tools, "protocol": PROTOCOL_VERSION, "dataDirectory": crate::paths::data_dir()?, "github": crate::github_auth::status(),
                "engine": { "pid": std::process::id(), "executable": std::env::current_exe()?, "version": env!("CARGO_PKG_VERSION") }
            }),
        )
    }
}
