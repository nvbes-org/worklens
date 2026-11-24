import type { BookmarkEntry, DirectoryEntry, JobEntry, SecretEntry } from './types';

export const SAMPLE_BOOKMARKS: BookmarkEntry[] = [
  {
    id: 'b1',
    command: 'cargo check --workspace',
    description: 'Verify Rust workspace compilation',
    category: 'Rust',
  },
  {
    id: 'b2',
    command: 'pnpm dev',
    description: 'Launch Worklens desktop frontend',
    category: 'Web',
  },
  {
    id: 'b3',
    command: 'git status -s',
    description: 'Quick git change summary',
    category: 'Git',
  },
  {
    id: 'b4',
    command: 'cargo test --workspace',
    description: 'Run all monorepo unit & integration tests',
    category: 'Rust',
  },
];

export const SAMPLE_DIRS: DirectoryEntry[] = [
  { id: 'd1', name: 'desktop', path: 'apps/desktop', lastVisited: Date.now() - 1000 * 60 * 5 },
  {
    id: 'd2',
    name: 'aurora-core',
    path: 'crates/aurora-core',
    lastVisited: Date.now() - 1000 * 60 * 20,
  },
  {
    id: 'd3',
    name: 'aurora-render',
    path: 'crates/aurora-render',
    lastVisited: Date.now() - 1000 * 60 * 60,
  },
];

export const SAMPLE_JOBS: JobEntry[] = [
  {
    id: 'j1',
    pid: 84210,
    command: 'vite dev --port 5173',
    cpuPercent: 1.2,
    memoryMb: 145,
    status: 'running',
  },
  {
    id: 'j2',
    pid: 84355,
    command: 'cargo watch -x check',
    cpuPercent: 0.4,
    memoryMb: 89,
    status: 'running',
  },
];

export const SAMPLE_SECRETS: SecretEntry[] = [
  {
    id: 's1',
    name: 'GITHUB_TOKEN',
    account: 'Keychain / User',
    preview: 'ghp_••••••••••••••••••••••••',
  },
  {
    id: 's2',
    name: 'OPENAI_API_KEY',
    account: 'Keychain / Worklens',
    preview: 'sk-proj-••••••••••••••••••••',
  },
];
