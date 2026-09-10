# Install and remove the local alpha

## Build

See [Contributing](../CONTRIBUTING.md) for prerequisites. From the cloned repository:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Outputs:

- `target/release/bundle/macos/Worklens.app`
- `target/release/bundle/dmg/Worklens_0.1.0-alpha.1_aarch64.dmg`
- `target/release/worklens` (CLI and MCP)

Open the locally built app, or mount the DMG and copy the app into Applications. Put the matching CLI binary in a directory on your PATH. Developer ID signing, Apple notarization, public distribution and automatic updates are not provided in this alpha. Gatekeeper may block downloaded builds; prefer building locally rather than disabling system protections.

No API server, container, subscription or LLM provider is necessary. GitHub features require the optional [GitHub App setup](github.md).

## First use

Open a repository from the welcome screen. Git and agent views are independent of GitHub. Architecture initially reads manifests and installed Cargo metadata. Trust in Settings permits local Nx/pnpm inspection; review repository plugins before granting it. Graph refresh is explicit, while local Git and agent presence update periodically. The source footer distinguishes unavailable, partial and cached/stale data.

Tool discovery uses the inherited PATH plus conventional Homebrew, Cargo and user executable locations. Worklens never sources shell profiles or installs missing tools. If a tool is installed elsewhere, launch from a terminal with a suitable PATH. Run `worklens doctor` for paths, versions, protocol and connector availability. Custom version-manager toolchains may require that terminal launch.

## Local data and troubleshooting

`worklens doctor` reports the exact data directory, normally `~/Library/Application Support/dev.worklens.Worklens`. `WORKLENS_DATA_DIR` overrides it for isolated tests; use a short, private path because Unix sockets have an OS path-length limit. Desktop, CLI and MCP must share the same directory to share state.

- “Protocol version mismatch”: quit Worklens, stop its local service, update both binaries, restart.
- “Connect GitHub” / expired authorization: reconnect in Settings. If the app is installed but access fails, verify selected repositories and read permissions.
- Offline Cargo error: workspace members may still be available through `--no-deps`; resolved dependencies and features are explicitly partial. Worklens never downloads the missing crates.
- Nx missing/version error: install/configure it yourself in that repository, then refresh after granting trust.
- Stale snapshot: inspect the source timestamp and detail. Use **Refresh graph** to recollect architecture. A workspace-wide refresh does not imply remote Git fetch.
- Large graph: the architecture canvas is bounded to 300 matching nodes; narrow the filter. Catalog/list and CLI preserve the full collected model. Collection output itself is bounded.

To stop the local service, identify its exact process in Activity Monitor: the executable is `worklens serve` or `Worklens.app/Contents/MacOS/worklens-desktop serve`. Quit the desktop first and terminate that specific service process. It is not registered with launchd. Never terminate unrelated Git/Cargo/Node processes to troubleshoot Worklens.

To remove local state, disconnect GitHub in Settings, quit the app and its service, then move only the exact Worklens data directory reported by doctor to Trash. This removes saved repositories, trust decisions, cached snapshots and agent events. Your inspected repositories are untouched. If the app cannot start, remove the `dev.worklens.github` / `github.com` credential using Keychain Access. Revoke the app's authorization on GitHub separately if desired. Delete the app and CLI copies to uninstall.
