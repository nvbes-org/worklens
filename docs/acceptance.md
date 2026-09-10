# Alpha acceptance record

Date: 2026-09-10. Target machine: Apple M3 Max, macOS 26.6.2.

Status: **local engineering alpha; complete acceptance remains pending**.
Live GitHub collection and native PR impact are verified below. Revocation/expiry,
fork and complete cross-view acceptance must not be inferred from passing mocks.

## Delivered surface

| Lot | Implemented | Validation |
| --- | --- | --- |
| Desktop and local Git | Tauri app, repository/recent selection, diagnostics, worktrees, branches, status, paged history/commit graph, bounded diffs | Real native app opened with nvbes; disposable Git edge cases |
| Polyglot catalog | Passive manifests, offline Cargo metadata/fallback, trusted local Nx/pnpm, graph provenance, dependants, task graph, impact | Real nvbes and Worklens; mixed/cycle/feature/missing-tool tests |
| GitHub | Configurable App Device Flow, Keychain, issue/PR pages and details, exact-SHA checks, jobs/logs, ETag/backoff and stale snapshots | HTTP/UI fixtures; real authenticated collection and native PR impact verified; full acceptance still pending |
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

### Functional increment: local work items

The work-item lifecycle is implemented across desktop, CLI and MCP: create from a source, explicit state, criteria, typed links, candidate confirmation/rejection, local notes and paginated history. Database schema 2 preserves existing settings and records. Revision conflicts and changed-payload retries fail without partial writes.

Validation for this increment: all six Nx check/lint/test targets passed without cache; 18 Rust tests, 12 Playwright scenarios and the real CLI/socket/MCP integration test passed. The native app created a real local Worklens delivery item; CLI reads returned that item, CLI added its PR/worktree/agent links, and native Reload displayed revision 4 with all three links and their history. The app and DMG were built and strict ad-hoc code-signature verification passed. No native performance claim is made.

See [work-item semantics](work-items.md). Locally declared validation expectations, structured decisions and selected local work-context export are implemented below.

### Functional increment: full PR impact

The shared `pr_impact` operation collects all available PR file pages, checks base/head revisions before and after, preserves rename/deletion paths, and explains direct components and transitive dependants. Desktop access is available from PR details and linked work items; CLI uses `pr-impact`, MCP uses `pr_impact`. Local graph mismatch, missing connectors, unmatched paths and workspace-wide files remain explicit. See [semantics and bounds](pr-impact.md).

The six Nx check/lint/test targets passed locally for this increment, including 27 Rust tests, 15 Playwright scenarios and the real CLI/socket/MCP integration test. Added fixtures exercise 102 files across two HTTP pages, late errors, invalid/duplicate rows, both SHA changes, final authorization failure, an empty PR and the 3,000-file cap. Browser fixtures exercise later-page impact, detail pagination independence, unverified results and linked work items. These are not a live GitHub or native acceptance claim.

Live recipe at 2026-09-10 15:54 UTC: Worklens PR #1 returned 120/120 files on two pages, with both revision checks matching and six direct local components. The rebuilt native app displayed the same counts and expanded the core component to its matching paths. nvbes PR #217 returned 143/143 files on two pages, 11 direct components and 22 transitive dependants through the CLI. Both results explicitly reported local graph mismatch/partial connectors; execution trust was not granted. These counts describe those snapshots, not later PR revisions. The app/DMG build and strict ad-hoc code-signature verification passed.

### Functional increment: validation center

Local work-item expectations are compared with GitHub checks and commit statuses for an exact SHA. The desktop exposes the report from PR details and linked work items; CLI/MCP share the operation and revision-protected expectation mutations. Non-success, absent, ambiguous and unknown results remain distinct. Schema 3 preserves older work items and prevents older builds from dropping the new fields. See [validation semantics](validations.md).

All six local Nx check/lint/test targets passed (the final run reused three unchanged frontend target outputs): 34 Rust tests, 17 Playwright scenarios, and the real CLI/socket/MCP integration test. One earlier integration run hit its service-startup timeout; the unchanged retry passed. Startup errors now retain bounded diagnostics, and another integration run passed. No timeout was increased.

The macOS app and DMG were built and strict ad-hoc signature verification passed. Native validation collection remains **unverified**: after restarting the rebuilt app, the service was observed blocked inside macOS Keychain access (`SecKeychainFindGenericPassword`) and a SecurityAgent process was present. The user must handle the system authorization prompt; automated tests are not a substitute for this live gate. A local integrity-checked SQLite backup was made before upgrading the active database.

### Functional increment: human–agent decisions

Work items now expose requests with explicit scope/options, motivated answers and cancellations across desktop, CLI and MCP. Closed decisions cannot be overwritten. Revision conflicts, invalid inputs, retries and concurrent resolution are handled atomically; history and declared attribution are preserved. No automatic execution or authenticated-human-approval claim is made. Schema 4 reads older items with empty decisions and prevents older builds from dropping the new data. See [decision semantics](decisions.md).

All six local Nx check/lint/test targets passed: 37 Rust tests, 19 Playwright scenarios and the real socket/CLI/MCP integration. Added tests cover schema-3 upgrade, repository isolation, duplicate IDs/events, terminal state protection, concurrent answer/cancellation, invalid options/reasons, restart persistence, explicit UI selection and retained drafts on conflict. The new UI reuses the existing shadcn Input/Button components and semantic form controls without new dependencies.

The app and DMG were rebuilt; strict ad-hoc signature verification passed. Native acceptance is still pending; the prior Keychain authorization block is not considered resolved by a request to continue development. Local tests use isolated databases and do not require the user's GitHub token. The new app was not launched against the active user database for this increment.

### Functional increment: selected work context

Desktop, CLI and MCP share revision-checked, explicit work-context selection and temporary paginated snapshots. Summary, declared references, decisions, local expectations, confirmed local sources and chosen indexed documents are independent selections. Missing sources stay explicit. Export never starts Nx or reads GitHub credentials; PR discussions, CI logs, notes and remote evidence aggregation are excluded. See [selection and bounds](work-context.md).

Local verification: 43 Rust tests, 21 Playwright scenarios and the real CLI/socket/MCP integration passed. Coverage includes serialized byte budgets, stable pages after source/work changes, source isolation, symlink escapes, unavailable cached catalogs, expiry/eviction/restart, inert source rendering and actual browser clipboard output. All six Nx check/lint/test targets passed on the final run; three engine targets reused their verified outputs. One earlier engine test target failed and its unchanged retry passed; the cause was not isolated, and Nx reported the task as flaky. No test timeout or retry setting was increased.

The export skill informed explicit bounded pages instead of an unbounded bulk dump. Existing UI components are reused. The CLI, macOS app and DMG were rebuilt; strict ad-hoc app signature verification passed. Native acceptance remains separate from simulated browser tests; the prior Keychain authorization issue is not treated as resolved, and the new app was not launched against the active user database during this increment.

### Functional increment: individual notes in work context

The context picker now selects individual local notes by stable event ID, with paginated history and removal across pages. Nothing is preselected. Desktop, CLI and MCP share the same note lookup, scoped to the selected work item and repository. Export preserves original declared actor/date/revision, rejects stale work revisions and invalid/foreign/non-note IDs, and retains the existing snapshot lifetime and byte limits. No database migration or automatic history export is introduced.

All six local Nx check/lint/test targets passed; the final run reused three unchanged engine outputs. 46 Rust tests, 24 Playwright scenarios and one real CLI/socket/MCP integration passed. Added coverage exercises opt-in selection, event ordering, cross-work/repository isolation, history beyond 50 events, persistence, stable snapshot pages, Unicode byte budgets, inert note text, deselection and revision conflicts. The first pagination browser test installed its fixture after the query cache was populated; setup now precedes the initial picker query. No timeout or retry setting was increased.

The CLI, macOS app and DMG were rebuilt; strict ad-hoc signature verification passed. Native acceptance remains separate: this increment is tested on isolated databases and simulated browser transport, not against the active user database or the prior Keychain authorization prompt.

### Remaining native acceptance

1. The GitHub App connection is working. Complete the remaining live recipe in [GitHub setup](github.md), including expiration/revocation and a fork PR.
2. Verify the complete native PR → changed components → exact CI → worktree → declared agent path with that connection. The equivalent mocked React path passes; it is not a substitute for this gate.
3. Record native first-known-state timing on a quiet machine and repeat under representative repository load.
4. Check the actual remote GitHub Actions result for the delivered PR; local success does not imply remote CI success.

## Explicit limits

- One repository at a time in the UI, local desktop alpha only; no multi-user authorization boundary.
- Passive JavaScript manifests can include archives. Installed pnpm dependency inspection is depth-limited, not a universal lockfile resolver.
- Large graph canvases show up to 300 matching nodes; collectors and exports have explicit bounds. Full PR impact collects all available file pages (up to 3,000) but still uses the current local worktree graph, not an immutable PR checkout.
- Same-name worktrees without matching source upstream or SHA remain candidates. Same-worktree agents without a declared PR URL are labeled candidates.
- Search is local names/document paths/agent objectives, not a remote full-text search engine.
- GitHub refresh tokens, Enterprise hosts, hosted services, public notarization, auto-update, Git/GitHub mutations, orchestration, scaffolding, cache administration and CI generation are not included.

See [architecture](architecture.md) for evidence semantics and [installation](install.md) for artifact paths and removal instructions.
