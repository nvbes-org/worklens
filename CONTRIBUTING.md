# Contributing

Target: macOS Apple Silicon, current stable Rust with Clippy/rustfmt, Node 22 or newer, pnpm 10.17.1, Xcode Command Line Tools. No GitHub credentials are required for tests.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm dev
pnpm check
pnpm lint
pnpm test
pnpm build
```

Nx orchestrates `engine` and `desktop`. Use `pnpm nx show project <name>` for targets. Rust edits require `cargo check --workspace`; frontend edits require `pnpm nx run desktop:check`. Change Rust contracts first, then `pnpm contracts`; commit generated types with the Rust changes. No TypeScript `any` is accepted. Keep modules focused, preferably below 300 lines and always below 500.

Tests use disposable repositories and an injected transport only in Vite's test mode. Production builds cannot use that transport. Service tests speak actual MCP stdio and actual Unix sockets. Do not use live user repositories as mutation fixtures. The opt-in `node tests/local-recipe.mjs <repo> ...` performs read-only observations; it trusts only the Worklens implementation directory for connector validation.

Sign commits with `git commit -S`. Pull requests must report checks run and outstanding acceptance prerequisites. Do not commit personal repository screenshots, credentials, native build outputs, logs or SQLite files. The GitHub Actions workflow uses read-only permissions, no secrets and no `pull_request_target`. App registration, Developer ID signing and notarization must never be made prerequisites for untrusted contribution tests.

UI primitives follow the project registry, then shadcn/ui, then compatible third-party components, then Tailwind. React Flow supplies the graph surface and ELK supplies layout; neither is replaced by custom canvas code. shadcn's `cn` imports resolve to the local `src/lib/utils.ts`, not an unrelated npm package.

Keep provider integrations replaceable and provenance explicit. Do not add Git/GitHub writes, agent orchestration, hosted dependencies, telemetry or automatic installations without a new product decision.
