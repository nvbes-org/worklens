# Worklens

A local desktop cockpit connecting repository architecture, Git worktrees,
GitHub delivery, and explicitly reported agent activity.

Worklens is an independent project. Its first alpha targets macOS Apple Silicon.
Implementation and acceptance results are tracked in [acceptance](docs/acceptance.md).

Functional increments include [local work items](docs/work-items.md) and [full PR impact](docs/pr-impact.md): objectives, declared source links, notes, revision-protected history, all-page file collection and explained local dependency reachability shared by desktop, CLI and MCP.

## Start locally

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Requires macOS Apple Silicon, Rust, Node, pnpm and Xcode Command Line Tools.
`pnpm build` creates the desktop app, local DMG and CLI. No hosted service or LLM account is required.

- Git changes, branches, commit graph and worktrees without fetch or mutation.
- Catalog and source-backed graphs from manifests, installed Cargo data and trusted Nx/pnpm.
- GitHub App connection, issues, pull requests, exact-SHA checks, workflow jobs and bounded logs.
- [Validation center](docs/validations.md): declared expectations versus observed checks/statuses, with missing, ambiguous and unavailable results kept explicit.
- [Human–agent decisions](docs/decisions.md): scoped requests, explicit answers/cancellations and history across desktop, CLI and MCP; no automatic execution or authenticated approval claim.
- [Selected work context](docs/work-context.md): explicit local-source selection, revision-bound snapshots and bounded Markdown/JSON pages shared by desktop, CLI and MCP.
- Explicit agent declarations, presence and selected context through desktop, CLI and MCP.

See [installation](docs/install.md), [CLI/MCP](docs/cli.md), [GitHub setup](docs/github.md),
[architecture](docs/architecture.md), [security](SECURITY.md) and [contributing](CONTRIBUTING.md).

The first alpha is local-only. Live GitHub acceptance requires a registered GitHub App;
notarization, public auto-updates, Git/GitHub writes and agent orchestration are deferred.

Licensed under Apache-2.0.
