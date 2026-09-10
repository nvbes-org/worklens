# Alpha acceptance record

Date: 2026-09-10. Target machine: Apple M3 Max, macOS 26.6.2.

Status: **local engineering alpha; end-to-end GitHub acceptance remains pending**.
Do not interpret the presence of GitHub UI or passing mocks as a completed live connection.

## Delivered surface

| Lot | Implemented | Validation |
| --- | --- | --- |
| Desktop and local Git | Tauri app, repository/recent selection, diagnostics, worktrees, branches, status, paged history/commit graph, bounded diffs | Real native app opened with nvbes; disposable Git edge cases |
| Polyglot catalog | Passive manifests, offline Cargo metadata/fallback, trusted local Nx/pnpm, graph provenance, dependants, task graph, impact | Real nvbes and Worklens; mixed/cycle/feature/missing-tool tests |
| GitHub | Configurable App Device Flow, Keychain, issue/PR pages and details, exact-SHA checks, jobs/logs, ETag/backoff and stale snapshots | HTTP and UI fixtures; real App authorization pending |
| Agents / CLI / MCP | Explicit session protocol, task/presence separation, transactional event deduplication, shared queries and selected context | Real CLI/socket/MCP stdio parity and restart test |
| Cockpit / local packaging | Overview, delivery summary, local search, source navigation, docs/context selection, local app and DMG | Browser tests and native local launch; notarization intentionally excluded |

## Automated checks

Commands: `pnpm check`, `pnpm lint`, `pnpm test`, also orchestrated together by `pnpm nx run-many -t check lint test --parallel=1`.

- Rust: 14 tests covering empty repos, detached/multiple worktrees, renames/spaces/binaries, conflicts, root commit diffs, cycles/directory boundaries, Cargo features, offline member fallback with no lockfile or installation, untrusted Nx, symlink escape, context pagination, event retries/concurrent updates, terminal states and persistence.
- GitHub HTTP fixtures within the Rust suite: device pending/slowdown/denial/expiry, ETag, limits, pagination, forks, exact SHA, insufficient permissions, cancelled CI and missing logs. Credential strings are not returned in failures.
- One actual service integration test: private directory/socket permissions, protocol rejection, CLI/MCP result parity, MCP trust denial, deduplication, finish via MCP and SQLite persistence after service restart.
- Eight Playwright scenarios: reference PR path, Git views, ELK worker/catalog, safe docs and explicit trust, independent agent state/presence, Device Flow UI, task/commit graphs and local overview timing. Tests use simulated source data but execute the real React/ELK code.
- Rust compilation, formatting, Clippy with warnings denied, TypeScript checking, Biome and generated-contract drift checks.

Browser parallelism is capped at two workers. An earlier seven-worker run overlapped release compilation and exceeded a five-second graph assertion; the two-worker rerun passed all eight scenarios. No production timeout was increased to hide this observation.

## Real repository observations

`node tests/local-recipe.mjs <nvbes-path> <worklens-path>` retains detailed local-only evidence in ignored `test-results/local-recipe.json`. No personal repository screenshots or raw private data are committed.

| Observation | nvbes | Worklens |
| --- | --- | --- |
| Worktrees | 37 | 1 |
| Local catalog identities, before Nx | 48 | 6 |
| Git collection, observed range | 156–346 ms | 133–219 ms |
| Initial graph collection, observed range | 717–1,925 ms | 278–368 ms |
| Cached graph read, observed range | 144–251 ms | 42–77 ms |

These are samples on a shared machine, not a statistical benchmark or performance guarantee. Worklens exercises all local connectors: trusted Nx task graph returned four tasks; pnpm returned installed resolution data. Cargo could not resolve an unavailable Android dependency offline and correctly returned its four local crate members as partial data instead of downloading it. nvbes remained untrusted: its Nx plugins were not executed.

The browser fixture overview rendered in 1,181 ms on the two-worker run, versus 3,677 ms under the earlier heavier concurrent load. Native Tauri launch and the nvbes architecture view were visually inspected; native first-paint timing has not been instrumented. **The two-second target is not yet a guaranteed native acceptance result.**

## Remaining acceptance gates

1. Register/install a read-only GitHub App, enable Device Flow and provide its public Client ID. Complete the live recipe in [GitHub setup](github.md), including expiration/revocation and a fork PR.
2. Verify the complete native PR → changed components → exact CI → worktree → declared agent path with that connection. The equivalent mocked React path passes; it is not a substitute for this gate.
3. Record native first-known-state timing on a quiet machine and repeat under representative repository load.
4. Check the actual remote GitHub Actions result for the delivered PR; local success does not imply remote CI success.

## Explicit limits

- One repository at a time in the UI, local desktop alpha only; no multi-user authorization boundary.
- Passive JavaScript manifests can include archives. Installed pnpm dependency inspection is depth-limited, not a universal lockfile resolver.
- Large graph canvases show up to 300 matching nodes; collectors and exports have explicit bounds. Impact uses the current local graph and currently selected PR file page.
- Same-name worktrees without matching source upstream or SHA remain candidates. Same-worktree agents without a declared PR URL are labeled candidates.
- Search is local names/document paths/agent objectives, not a remote full-text search engine.
- GitHub refresh tokens, Enterprise hosts, hosted services, public notarization, auto-update, Git/GitHub mutations, orchestration, scaffolding, cache administration and CI generation are not included.

See [architecture](architecture.md) for evidence semantics and [installation](install.md) for artifact paths and removal instructions.
