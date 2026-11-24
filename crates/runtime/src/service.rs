use crate::{error, storage::Store, Result};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use worklens_core::*;

pub struct Service {
    pub(crate) contexts: Mutex<crate::context_snapshot::ContextSnapshots>,
    pub store: Arc<Store>,
    pub auth: crate::github_auth::Auth,
    pub github: crate::github::Github,
    pub agent_lock: tokio::sync::Mutex<()>,
    pub processes: crate::process_manager::ProcessManager,
    pub permissions: Arc<crate::permissions::PermissionManager>,
    pub plugins: Arc<crate::plugins::PluginManager>,
    pub engines: Arc<crate::engines::EngineRegistry>,
    pub transports: Arc<crate::transport_manager::TransportManager>,
}

pub fn text<'a>(params: &'a Value, key: &str) -> Result<&'a str> {
    params[key]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 8192)
        .ok_or_else(|| error(format!("Missing or invalid {key}")))
}

impl Service {
    pub fn new(path: &Path) -> Result<Self> {
        let data_dir = path.parent().map(|p| p.to_path_buf());
        let store = Arc::new(Store::open(path)?);
        let permissions = Arc::new(crate::permissions::PermissionManager::new(store.db.clone()));
        let plugins = Arc::new(crate::plugins::PluginManager::new(None));
        let engines = Arc::new(crate::engines::EngineRegistry::new());
        crate::engines::builtins::register_all(&engines);
        let _ = plugins.sync_engines(&engines, &permissions);
        let transports = Arc::new(crate::transport_manager::TransportManager::new());

        Ok(Self {
            contexts: Default::default(),
            store: store.clone(),
            auth: Default::default(),
            github: Default::default(),
            agent_lock: tokio::sync::Mutex::new(()),
            processes: crate::process_manager::ProcessManager::with_db(
                data_dir,
                Some(store.db.clone()),
            ),
            permissions,
            plugins,
            engines,
            transports,
        })
    }
    pub fn db(&self) -> Result<&Store> {
        Ok(&self.store)
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
        let session = self.store.db.system();
        let gstore = lilia_graph::GraphStore::new(session.graph(&format!("repo:{}", repo.id)));
        for node in &graph.nodes {
            let metadata = serde_json::to_value(node).unwrap_or_default();
            let _ = gstore.set_node(&node.id, &node.kind, &metadata);
        }
        for edge in &graph.edges {
            let kind = format!("{:?}", edge.kind).to_lowercase();
            let _ = gstore.add_edge(&edge.source, &edge.target, &kind);
        }
        Ok(graph)
    }

    async fn dispatch(&self, request: &Request) -> Result<Value> {
        let p = &request.params;
        match &request.operation {
            Operation::ConfigProfileList
            | Operation::ConfigProfileGet
            | Operation::ConfigProfileSave
            | Operation::ConfigProfileDelete
            | Operation::ConfigProfileActivate
            | Operation::ConfigProfileActiveGet
            | Operation::TransportsStatus
            | Operation::TransportControl => {
                return crate::service_config::dispatch(self, request).await;
            }
            Operation::PermissionGrantsList
            | Operation::PermissionGrantSet
            | Operation::PermissionAuditList
            | Operation::PermissionCheck => {
                return crate::service_permissions::dispatch(self, request).await;
            }
            Operation::PluginList
            | Operation::PluginGet
            | Operation::PluginInstall
            | Operation::PluginUninstall
            | Operation::PluginEnable
            | Operation::PluginDisable
            | Operation::EnginesList
            | Operation::EngineExecute
            | Operation::EngineRealtimeList
            | Operation::EngineRealtimeStatus => {
                return crate::service_plugins::dispatch(self, request).await;
            }
            Operation::MachineResourcesGet
            | Operation::ProcessList
            | Operation::ProcessStart
            | Operation::ProcessStop
            | Operation::ProcessKill
            | Operation::ProcessRestart
            | Operation::ProcessSendInput
            | Operation::ProcessLogs
            | Operation::ProcessClearLogs
            | Operation::DiscoveredCommandsList
            | Operation::AutoKillPolicyGet
            | Operation::AutoKillPolicySet
            | Operation::AutoKillEventsList
            | Operation::EnvironmentProfilesList
            | Operation::EnvironmentProfileSave
            | Operation::EnvironmentProfileDelete => {
                return crate::service_process::dispatch(self, request).await;
            }
            Operation::PreferencesGet => {
                let key = p["key"].as_str().unwrap_or("appearance");
                let val = self.db()?.setting(&format!("pref:{key}"))?;
                let parsed = val
                    .and_then(|v| serde_json::from_str::<Value>(&v).ok())
                    .unwrap_or(Value::Null);
                return Ok(parsed);
            }
            Operation::PreferencesSet => {
                let key = p["key"].as_str().unwrap_or("appearance");
                let val = serde_json::to_string(&p["value"]).unwrap_or_default();
                self.db()?.set(&format!("pref:{key}"), &val)?;
                return Ok(json!({ "saved": true }));
            }
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
            Operation::ScalewayAuthStatus => {
                let mut status = crate::scaleway_auth::status();
                if let Ok(Some(pid)) = self.db()?.setting("scaleway_project_id") {
                    status["projectId"] = json!(pid);
                }
                return Ok(status);
            }
            Operation::ScalewayAuthSet => {
                let secret = text(p, "secretKey")?;
                crate::scaleway_auth::set_token(secret)?;
                if let Some(pid) = p["projectId"].as_str() {
                    self.db()?.set("scaleway_project_id", pid)?;
                }
                return Ok(json!({ "saved": true, "connected": true }));
            }
            Operation::ScalewayAuthLogout => {
                return crate::scaleway_auth::logout();
            }
            Operation::ScalewayLiveFetch => {
                let (token, source) = crate::scaleway_auth::token()?;
                let setting_pid = self.db()?.setting("scaleway_project_id").ok().flatten();
                let pid = p["projectId"].as_str().or(setting_pid.as_deref());
                let report = crate::scaleway_client::fetch_live_report(&token, source, pid).await;
                return Ok(serde_json::to_value(report)?);
            }
            Operation::MultiRepoList
            | Operation::MultiRepoGet
            | Operation::MultiRepoSave
            | Operation::MultiRepoDelete
            | Operation::MultiRepoStatus
            | Operation::MultiRepoBatch => {
                return crate::multi_repo::dispatch(self, &request.operation, p).await;
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
            Operation::GitAction => {
                let res = crate::git_actions::execute_action(root, p).await?;
                Ok(res)
            }
            Operation::GitReflog => {
                let limit = p["limit"].as_u64().unwrap_or(30) as u32;
                let entries = crate::git_actions::reflog(root, limit).await?;
                Ok(serde_json::to_value(entries)?)
            }
            Operation::CommitFiles => {
                let sha = text(p, "sha")?;
                let files = crate::git_actions::commit_files(root, sha).await?;
                Ok(serde_json::to_value(files)?)
            }
            Operation::FileRead => {
                let path = text(p, "path")?;
                let file = crate::editor_service::file_read(root, path).await?;
                Ok(serde_json::to_value(file)?)
            }
            Operation::FileWrite => {
                let path = text(p, "path")?;
                let content = text(p, "content")?;
                crate::editor_service::file_write(root, path, content).await?;
                Ok(json!({ "saved": true, "path": path }))
            }
            Operation::FileList => {
                let files = crate::editor_service::file_list(root).await?;
                Ok(serde_json::to_value(files)?)
            }
            Operation::ConflictList => {
                let conflicts = crate::merge_service::conflict_list(root).await?;
                Ok(serde_json::to_value(conflicts)?)
            }
            Operation::ConflictDetails => {
                let path = text(p, "path")?;
                let details = crate::merge_service::conflict_details(root, path).await?;
                Ok(serde_json::to_value(details)?)
            }
            Operation::ResolveConflict => {
                let path = text(p, "path")?;
                let content = text(p, "content")?;
                crate::merge_service::resolve_conflict(root, path, content).await?;
                Ok(json!({ "resolved": true, "path": path }))
            }
            Operation::Projects | Operation::Graph => {
                let mut graph = self
                    .graph(&repo, p["refresh"].as_bool().unwrap_or(false))
                    .await?;
                if p["includeVendors"].as_bool().unwrap_or(false) {
                    crate::catalog_vendors::extend(root, &mut graph)?;
                }
                Ok(serde_json::to_value(graph)?)
            }
            Operation::ComponentMetadata => crate::component_metadata::query(self, &repo, p).await,
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
                    crate::git::snapshot(repo.clone(), 0)
                        .await?
                        .changes
                        .into_iter()
                        .map(|c| c.path)
                        .collect()
                };
                let session = self.store.db.system();
                let gstore =
                    lilia_graph::GraphStore::new(session.graph(&format!("repo:{}", repo.id)));
                if gstore.list_nodes(None, Some(1)).unwrap_or_default().is_empty() {
                    for node in &graph.nodes {
                        let metadata = serde_json::to_value(node).unwrap_or_default();
                        let _ = gstore.set_node(&node.id, &node.kind, &metadata);
                    }
                    for edge in &graph.edges {
                        let kind = format!("{:?}", edge.kind).to_lowercase();
                        let _ = gstore.add_edge(&edge.source, &edge.target, &kind);
                    }
                }
                let direct_ids: Vec<String> = graph
                    .nodes
                    .iter()
                    .filter(|n| {
                        !n.external
                            && paths.iter().any(|p| {
                                n.root.is_empty()
                                    || n.root == "."
                                    || p == &n.root
                                    || p.starts_with(&format!("{}/", n.root))
                            })
                    })
                    .map(|n| n.id.clone())
                    .collect();
                let impact = if let Ok(analysis) = gstore.impact_analysis(&direct_ids) {
                    Impact {
                        direct: analysis.direct,
                        dependants: analysis.dependants,
                        warning: "Dependency reachability is an impact estimate, not proof of sufficient validation.".into(),
                    }
                } else {
                    worklens_core::impact(&graph, &paths)
                };
                Ok(serde_json::to_value(impact)?)
            }
            Operation::PrImpact => crate::service_impact::collect(self, &repo, p).await,
            Operation::ValidateBoundaries
            | Operation::GithubPublishChecks
            | Operation::GithubDispatchWorkflow
            | Operation::GithubPostImpactComment => {
                crate::service_github_ext::handle(self, &repo, &request.operation, p).await
            }
            Operation::Validations => crate::service_validations::collect(self, &repo, p).await,
            Operation::FolderSizes => crate::folder_sizes::scan(root, p).await,
            Operation::CloudScan => crate::service_cloud::dispatch(self, &repo, p).await,
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
