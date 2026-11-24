import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Activity, GitBranch, HardDrive, PanelLeft, RefreshCw, Search, Settings, Terminal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { query } from '../lib/api';
import { useGit, useSession } from '../lib/session';
import { ErrorNotice } from './common';
import { FolderSizesDialog } from './folder-sizes';
import { SearchResults } from './search-results';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { IslandButton, IslandGroup } from './ui/island';
import { InstanceDock, useWindowManager } from './window-manager';

export function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <IslandButton
      size="icon-sm"
      onClick={onToggle}
      className="sidebar-toggle-fixed"
      aria-label={collapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
      title={collapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
      aria-expanded={!collapsed}
      aria-controls="project-sidebar"
    >
      <PanelLeft className="size-3.5" />
    </IslandButton>
  );
}

export function WorkspaceToolbar() {
  const { repo, open } = useSession();
  const git = useGit();
  const client = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [folderSizesOpen, setFolderSizesOpen] = useState(false);
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

  const windowManager = useWindowManager();

  const handleOpenTerminal = useCallback(() => {
    const existing = windowManager.instances.find((w) => w.rendererId === 'aurora-terminal');
    if (existing) {
      if (existing.state === 'hidden' || existing.state === 'frozen') {
        void windowManager.restoreWindow(existing.id);
      } else {
        windowManager.focusWindow(existing.id);
      }
      return;
    }
    windowManager.createWindow({
      title: 'AuroraTerm',
      subtitle: repo?.name ? `${repo.name}${git.data?.branch ? ` ( ${git.data.branch})` : ''}` : 'Terminal',
      iconName: 'terminal',
      dockMode: 'docked',
      dockSlot: 'main',
      rendererId: 'aurora-terminal',
      initialData: {
        cwd: repo?.path,
        branch: git.data?.branch,
      },
    });
  }, [windowManager, repo, git.data?.branch]);

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k' && !event.defaultPrevented) {
        if (document.querySelector('.workspace-shell[data-settings="true"]')) return;
        event.preventDefault();
        setSearchOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '`' && !event.defaultPrevented) {
        event.preventDefault();
        handleOpenTerminal();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleOpenTerminal]);
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
      <header className="workspace-toolbar" data-tauri-drag-region>
        {repo && (
          <div className="worktree-control">
            <GitBranch className="size-4 shrink-0 text-muted-foreground" />
            <select
              aria-label="Active worktree"
              disabled={!git.data?.worktrees.length}
              value={repo.path}
              onChange={(event) => void open(event.target.value)}
            >
              {!git.data?.worktrees.some((tree) => tree.path === repo.path) && (
                <option value={repo.path}>{git.data?.branch ?? 'No worktree'}</option>
              )}
              {git.data?.worktrees.map((tree) => (
                <option key={tree.path} value={tree.path} disabled={tree.prunable}>
                  {tree.branch ?? 'Detached HEAD'}
                  {tree.path !== repo.path ? ` · ${tree.path.split('/').pop()}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {repo ? (
          <IslandGroup className="ml-auto toolbar-action-group">
            <Button
              variant="ghost"
              size="sm"
              className="toolbar-search-btn h-7 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="size-3.5" />
              <span className="toolbar-search-label">Search project</span>
              <kbd className="ml-2 text-[10px] font-mono opacity-60">⌘ K</kbd>
            </Button>
            <div className="island-divider" />
            <InstanceDock />
            <div className="island-divider" />
            <Button
              variant="ghost"
              size="icon-xs"
              data-testid="toolbar-btn-terminal"
              className="size-7 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="AuroraTerm Terminal (⌘`)"
              title="AuroraTerm Terminal (⌘`)"
              onClick={handleOpenTerminal}
            >
              <Terminal className="size-3.5 text-cyan-400" />
            </Button>
            <div className="island-divider" />
            <Button
              asChild
              variant="ghost"
              size="icon-xs"
              className="size-7 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Process Manager & Debug Studio"
              title="Process Manager & Debug Studio"
            >
              <Link to="/$view" params={{ view: 'processes' }}>
                <Activity className="size-3.5 text-emerald-400" />
              </Link>
            </Button>
            <div className="island-divider" />
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-7 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Folder sizes & storage"
              title="Folder sizes & storage"
              onClick={() => setFolderSizesOpen(true)}
            >
              <HardDrive className="size-3.5" />
            </Button>
            <div className="island-divider" />
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-7 rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Refresh workspace"
              onClick={() => void client.invalidateQueries()}
            >
              <RefreshCw className="size-3.5" />
            </Button>
            <div className="island-divider" />
            <Button
              asChild
              variant="ghost"
              size="icon-xs"
              className="size-7 rounded-full text-muted-foreground hover:text-foreground"
            >
              <Link to="/$view" params={{ view: 'settings' }} aria-label="Settings" title="Settings (⌘,)">
                <Settings className="size-3.5" />
              </Link>
            </Button>
          </IslandGroup>
        ) : (
          <div className="ml-auto flex items-center gap-1.5">
            <InstanceDock />
            <IslandButton asChild size="icon-sm">
              <Link to="/$view" params={{ view: 'settings' }} aria-label="Settings" title="Settings (⌘,)">
                <Settings className="size-3.5" />
              </Link>
            </IslandButton>
          </div>
        )}
      </header>
      <FolderSizesDialog open={folderSizesOpen} onOpenChange={setFolderSizesOpen} />
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
