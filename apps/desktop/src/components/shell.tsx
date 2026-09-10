import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import {
  Activity,
  BookOpen,
  Bot,
  CircleDot,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  LayoutDashboard,
  Network,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { query } from '../lib/api';
import { useSession } from '../lib/session';
import { ErrorNotice } from './common';
import { SearchResults } from './search-results';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Welcome } from './welcome';

const navigation = [
  { view: 'overview', label: 'Overview', icon: LayoutDashboard },
  { view: 'work', label: 'Work items', icon: CircleDot },
  { view: 'architecture', label: 'Architecture', icon: Network },
  { view: 'git', label: 'Git & worktrees', icon: GitBranch },
  { view: 'pull-requests', label: 'Pull requests', icon: GitPullRequest },
  { view: 'issues', label: 'Issues', icon: CircleDot },
  { view: 'ci', label: 'CI monitoring', icon: Activity },
  { view: 'agents', label: 'Agents', icon: Bot },
  { view: 'documents', label: 'Docs & context', icon: BookOpen },
];

export function Shell() {
  const { repo, open, error } = useSession();
  const client = useQueryClient();
  const [change, setChange] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<unknown>(null);
  const [searchError, setSearchError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside className="flex w-[225px] shrink-0 flex-col border-r bg-[#f1f4ef] p-4">
        <div className="mb-8 flex items-center gap-3 px-2 pt-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#203c2d] text-lg font-bold text-[#d2efdb]">
            W
          </div>
          <span className="text-lg font-semibold tracking-tight">
            worklens<span className="ml-1 text-primary">.</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setChange(!change)}
          className="mb-6 flex items-center gap-2 rounded-lg border bg-white px-3 py-3 text-left text-sm"
        >
          <FolderOpen className="size-4 text-muted-foreground" />
          <span className="truncate">{repo?.name ?? 'Open workspace'}</span>
        </button>
        <p className="mb-3 px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Workspace
        </p>
        <nav className="space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.view}
              to="/$view"
              params={{ view: item.view }}
              activeProps={{ className: 'bg-[#dce8dd] text-[#204d32] font-medium' }}
              inactiveProps={{ className: 'text-muted-foreground hover:bg-white/60' }}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px]"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <Link
            to="/$view"
            params={{ view: 'settings' }}
            className="flex items-center gap-3 rounded-lg px-3 py-3 text-[13px] text-muted-foreground"
          >
            <Settings className="size-4" />
            Settings
          </Link>
          <div className="mt-4 border-t px-3 pt-4 text-[11px] text-muted-foreground">
            <span className="mr-2 inline-block size-1.5 rounded-full bg-emerald-600" />
            Local workspace<span className="mt-1 block pl-3.5 text-[10px]">0.1.0-alpha.1</span>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-white/70 px-8">
          <span className="text-xs text-muted-foreground">
            {repo?.name ?? 'Worklens'}
            <span className="mx-3 text-border">/</span>Workspace
          </span>
          <form
            className="ml-auto flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (repo)
                void query('search', repo.path, { query: search })
                  .then(setResults)
                  .catch((e) => setSearchError(String(e)));
            }}
          >
            <Search className="size-4 text-muted-foreground" />
            <Input
              ref={input}
              aria-label="Search workspace"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 border-0 bg-transparent text-xs shadow-none"
              placeholder="Search workspace…"
            />
            <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘ K</kbd>
          </form>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh workspace"
            onClick={() => void client.invalidateQueries()}
          >
            <RefreshCw className="size-4" />
          </Button>
        </header>
        <main className="min-h-0 flex-1 overflow-auto px-8 py-8">
          <ErrorNotice error={error || searchError} />
          {results !== null && (
            <section className="mb-6">
              <div className="mb-3 flex justify-between">
                <h2 className="font-semibold">Search results</h2>
                <Button variant="ghost" onClick={() => setResults(null)}>
                  Close
                </Button>
              </div>
              <SearchResults value={results} />
            </section>
          )}
          {change && repo ? (
            <section className="mb-6">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const path = new FormData(e.currentTarget).get('path');
                  if (typeof path === 'string') void open(path).then(() => setChange(false));
                }}
              >
                <Input
                  name="path"
                  placeholder="/path/to/repository"
                  aria-label="Change repository path"
                  required
                />
                <Button>Open</Button>
              </form>
            </section>
          ) : null}
          {repo ? <Outlet /> : <Welcome />}
        </main>
      </div>
    </div>
  );
}
