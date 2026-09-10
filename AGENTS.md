# Worklens contributor contract

- Worklens is independent of the repositories it observes; never import nvbes internals.
- Follow the accepted Rust + Tauri + React architecture in `docs/architecture.md`.
- Keep modules focused and generally below 300 lines; extract before 500 lines.
- Use `rtk` for shell commands in environments that provide it.
- Use pnpm and Nx for workspace targets, Cargo for Rust checks.
- Use apply_patch for manual edits. Preserve other contributors' changes.
- No TypeScript `any`; Rust libraries use typed errors.
- The engine owns behavior shared by desktop, CLI and MCP.
- No repository writes during observation, no automatic fetch or dependency installation.
- Execute workspace tools only for explicitly trusted repositories.
- Tokens belong in the OS keychain, never logs, exports or SQLite.
- Validate relevant targets and `cargo check --workspace` after Rust changes.
- Sign commits with `git commit -S`. Never claim unexecuted checks passed.
