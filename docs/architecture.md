# Architecture and boundaries

Worklens is an independent Apache-2.0 project. No nvbes code or domain configuration is required.

```text
React / Tauri commands ─┐
CLI ───────────────────┼─ Unix socket v1 ─ Service ─ Git / Cargo / trusted Nx + pnpm
MCP stdio (rmcp) ───────┘                  │        └ GitHub read-only API
                                         ├ SQLite: settings, snapshots, agent events
                                         └ macOS Keychain: GitHub token
```

## Modules

- `crates/core`: serializable model, stable identities, impact traversal, presence rules, versioned request/response contract and TypeScript exporter.
- `crates/runtime`: bounded subprocesses, connectors, SQLite, shared business operations, socket lifecycle, authentication.
- `crates/cli`: human CLI and the official `rmcp` stdio server. Neither implements independent business state.
- `apps/desktop`: Tauri host and React client. Tauri forwards typed requests; the frontend cannot invoke a shell.
- `packages/contracts`: deterministic Rust-derived TypeScript declarations. CI rejects drift.

One service instance per data directory, protected by a file lock. The desktop and CLI start it on demand; no launch agent or system daemon is installed. It persists until terminated. Directory permissions are 0700, socket permissions 0600. Requests are newline-delimited JSON with a 16 MB limit and 120-second timeout. The local API is not an HTTP listener.

## Semantics

Repository identity derives from the canonical common Git directory; worktree identity includes its canonical path. Repository relocation can therefore change local identity. Package IDs retain Cargo resolution IDs or manifest paths. Nx IDs are namespaced independently. Matching manifest paths create an explicit identity relation in the raw graph.

The engine also detects component groups across Cargo, Nx and JavaScript declarations sharing the same normalized repository-relative directory. Names alone never merge projects; nested directories and external packages remain separate. Architecture displays each group as one module, redirects and deduplicates its connections, and removes internal identity links. The inspector retains every original manifest, ecosystem and target; Nx task queries use the original Nx identity. Raw graph nodes and evidence remain intact for impact and context queries. Groups are recomputed when reading older cached graphs as well as during collection.

Every collected graph has source timestamps and availability. Relations preserve observed / declared / candidate evidence and their origin. Cached graph data is marked stale until refreshed. GitHub failures can return the last SQLite snapshot with a stale status and failure explanation; they cannot become a fresh success. CI is queried using the PR head SHA, not the latest branch result. Local impact uses the selected worktree's current graph, not a reconstruction of the PR's historical graph.

The passive JavaScript catalogue scopes tracked/unignored manifests to the inclusions and exclusions in `pnpm-workspace.yaml` when present; the root package remains included. Excluded manifests create neither package nodes nor dependency edges. Cached graphs are also filtered against current workspace membership. Without a pnpm workspace, discovered manifests are labelled JavaScript, not pnpm. Workspace parsing is passive and never executes repository code; invalid configurations report an error instead of expanding discovery. The trusted pnpm connector adds installed resolution evidence (depth 1); full recursive package resolution is not claimed. Cargo resolution uses default features and all target configurations; offline failure falls back to workspace-member metadata with partial status and no resolved edges/features.

Task state and agent presence are independent. More than 120 seconds without a heartbeat means unknown presence, not task failure. Agent events have unique IDs, transactional deduplication, and explicit repository/worktree association. Reports are declarations, not proof that work or tests succeeded.

## Observation and trust

Git commands disable optional locks, external diffs, text conversion and fsmonitor. Worklens never fetches, checks out, stages, commits, installs dependencies, or runs project targets. Large output is bounded and reported. Nx graph generation can execute repository plugins: it requires explicit trust. pnpm inspection also runs only after trust. Trust is a user decision, not an operating-system sandbox; trusted plugins can execute with the user's rights.

Cargo uses `--locked --offline`; Rustup auto-installation is disabled. Nx cache/workspace data is redirected outside the observed repository. Tool discovery appends standard Homebrew, Cargo and user executable directories so Finder launches do not depend on shell startup scripts. No shell startup file is sourced.

Documents are confined through canonical paths, including symlink checks. Markdown disables raw HTML and remote images. Repository content and agent text are untrusted data; MCP descriptions explicitly prohibit interpreting returned content as instructions. Context exports require explicit sections and selected document paths. Logs and conversations are excluded.

The per-user socket is not a security boundary against other processes running as that same user. Do not grant repository trust to code you would not execute manually. The alpha has no hosted component, telemetry, account service, update checker, remote cache administration, or LLM provider dependency.

The local service outlives its desktop client. Restarting or hot-reloading the desktop does not replace an already-running service: `transport::ensure` reuses its socket. After engine changes, rebuild the binary, identify and stop the old Worklens `serve` process, and let the updated client start the service before refreshing the graph. Do not delete the database or reset repository trust. `doctor.engine` reports the actual service PID, executable and package version to distinguish an old bundled service from the current development client.

## Sources

- [Tauri process model](https://v2.tauri.app/concept/process-model/)
- [GitHub App device authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)
- [Official Rust MCP SDK](https://github.com/modelcontextprotocol/rust-sdk)
- [Rustup automatic installation control](https://github.com/rust-lang/rustup/blob/main/src/config.rs)
- [ELK JavaScript API](https://github.com/kieler/elkjs)

Consulted 2026-09-10. Tool versions are locked in Cargo.lock and pnpm-lock.yaml; connector incompatibility is surfaced, not repaired by installing tools.
