import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { GitBranch, PanelLeft, RefreshCw, Search, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { query } from '../lib/api';
import { useGit, useSession } from '../lib/session';
import { ErrorNotice } from './common';
import { SearchResults } from './search-results';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';

export function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={onToggle}
      className="sidebar-toggle"
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-expanded={!collapsed}
      aria-controls="project-sidebar"
    >
      <PanelLeft className="size-[18px]" />
    </Button>
  );
}

export function WorkspaceToolbar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { repo, open } = useSession();
  const git = useGit();
  const client = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    request.current += 1;
    setResults(null);
    setSearch('');
    setBusy(false);
  }, [repo?.path]);
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k' && !event.defaultPrevented) {
        if (document.querySelector('.workspace-shell[data-settings="true"]')) return;
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  async function runSearch() {
    if (!repo || !search.trim()) return;
    const id = ++request.current;
    setBusy(true);
    setError('');
    try {
      const value = await query('search', repo.path, { query: search });
      if (id === request.current) setResults(value);
    } catch (e) {
      if (id === request.current) setError(String(e));
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  return (
    <>
      <header className="workspace-toolbar">
        <SidebarToggle collapsed={collapsed} onToggle={onToggle} />
        <div className="worktree-control">
          <GitBranch className="size-4 shrink-0 text-muted-foreground" />
          <select
            aria-label="Active worktree"
            disabled={!repo || !git.data?.worktrees.length}
            value={repo?.path ?? ''}
            onChange={(event) => void open(event.target.value)}
          >
            {!git.data?.worktrees.some((tree) => tree.path === repo?.path) && (
              <option value={repo?.path ?? ''}>{git.data?.branch ?? 'No worktree'}</option>
            )}
            {git.data?.worktrees.map((tree) => (
              <option key={tree.path} value={tree.path} disabled={tree.prunable}>
                {tree.branch ?? 'Detached HEAD'}
                {tree.path !== repo?.path ? ` · ${tree.path.split('/').pop()}` : ''}
              </option>
            ))}
          </select>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          onClick={() => setSearchOpen(true)}
          disabled={!repo}
        >
          <Search className="size-4" />
          <span className="toolbar-search-label">Search project</span>
          <kbd className="ml-3 text-[10px]">⌘ K</kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh workspace"
          disabled={!repo}
          onClick={() => void client.invalidateQueries()}
        >
          <RefreshCw className="size-4" />
        </Button>
        {collapsed && (
          <Button asChild variant="ghost" size="icon-sm">
            <Link to="/$view" params={{ view: 'settings' }} aria-label="Settings">
              <Settings className="size-4" />
            </Link>
          </Button>
        )}
      </header>
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Search project</DialogTitle>
            <DialogDescription>Find components and local documents.</DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <Input
              aria-label="Search workspace"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
            />
            <Button disabled={busy || !search.trim() || !repo}>{busy ? 'Searching…' : 'Search'}</Button>
          </form>
          <ErrorNotice error={error} />
          {results !== null && <SearchResults value={results} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProjectSwitcher({
  open: visible,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { open, repo, error } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={visible} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a project</DialogTitle>
          <DialogDescription>Inspect a local repository or monorepo.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const path = new FormData(e.currentTarget).get('path');
            if (typeof path !== 'string') return;
            setBusy(true);
            const opened = await open(path);
            setBusy(false);
            if (opened) onOpenChange(false);
          }}
        >
          <Input
            name="path"
            aria-label="Change repository path"
            defaultValue={repo?.path}
            placeholder="/path/to/repository"
            required
          />
          <ErrorNotice error={error} />
          <Button disabled={busy}>{busy ? 'Opening…' : 'Open project'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
