import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isTauri } from '@tauri-apps/api/core';
import type { MultiRepoWorkspace, Repository } from '@worklens/contracts';
import { ArrowRight, FolderOpen, Layers, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { query } from '../lib/api';
import { useSession } from '../lib/session';
import { ErrorNotice } from './common';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

function RecentWorkspaceItem({ repo, onOpen }: { repo: Repository; onOpen: (path: string) => void }) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const pathRef = useRef<HTMLSpanElement>(null);
  const [nameOverflow, setNameOverflow] = useState(false);
  const [pathOverflow, setPathOverflow] = useState(false);

  useEffect(() => {
    const nameEl = nameRef.current;
    const pathEl = pathRef.current;
    if (!nameEl && !pathEl) return;

    const check = () => {
      if (nameEl) setNameOverflow(nameEl.scrollWidth - nameEl.clientWidth > 1);
      if (pathEl) setPathOverflow(pathEl.scrollWidth - pathEl.clientWidth > 1);
    };

    check();
    const observer = new ResizeObserver(check);
    if (nameEl) observer.observe(nameEl);
    if (pathEl) observer.observe(pathEl);
    return () => observer.disconnect();
  }, [repo.name, repo.path]);

  const button = (
    <button
      type="button"
      className="group flex w-full items-center justify-between gap-6 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => onOpen(repo.path)}
    >
      <span
        ref={nameRef}
        className="min-w-0 max-w-[45%] shrink-0 truncate text-sm font-medium text-foreground block"
      >
        {repo.name}
      </span>
      <span
        ref={pathRef}
        className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground font-mono block"
      >
        {repo.path}
      </span>
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      {(nameOverflow || pathOverflow) && (
        <TooltipContent side="top" align="start" sideOffset={6} className="max-w-xl px-3.5 py-2">
          <p className="font-semibold text-xs text-background break-all">{repo.name}</p>
          <p className="text-[11px] opacity-75 font-mono break-all mt-1">{repo.path}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

export function Welcome() {
  const { open, error } = useSession();
  const [path, setPath] = useState('');
  const [browseError, setBrowseError] = useState('');
  const recent = useQuery({ queryKey: ['recent'], queryFn: () => query<Repository[]>('recent') });
  const multiWorkspaces = useQuery({
    queryKey: ['multi_repo_workspaces'],
    queryFn: () => query<MultiRepoWorkspace[]>('multi_repo_list'),
  });
  async function browse() {
    if (!isTauri()) return;
    setBrowseError('');
    try {
      const { open: choose } = await import('@tauri-apps/plugin-dialog');
      const selected = await choose({ directory: true, multiple: false });
      if (selected === null) return;
      if (typeof selected === 'string') await open(selected);
    } catch (error) {
      setBrowseError(String(error));
    }
  }
  return (
    <div className="mx-auto flex min-h-[75vh] max-w-2xl flex-col justify-center py-12">
      <h1 className="text-4xl font-semibold tracking-tight">See the whole picture.</h1>
      <form
        className="mt-8 flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void open(path);
        }}
      >
        <div className="welcome-searchbar flex-1 min-w-[280px]">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            aria-label="Repository path"
            placeholder="/path/to/your/repository"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!path.trim()}
            className="h-8 rounded-full px-3.5 text-xs font-medium gap-1.5 shadow-xs"
          >
            Open repository
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-[42px] rounded-full px-4 text-sm font-medium gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => void browse()}
          >
            <FolderOpen className="size-4" />
            Browse folders
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-[42px] rounded-full px-4 text-sm font-medium gap-2 text-muted-foreground hover:text-foreground"
          >
            <Link to="/$view" params={{ view: 'workspaces' }}>
              <Layers className="size-4 text-primary" />
              Workspaces
            </Link>
          </Button>
        </div>
      </form>
      <ErrorNotice error={error || browseError || recent.error} />
      {Boolean(multiWorkspaces.data?.length) && (
        <div className="mt-6 border-t pt-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Multi-Repo Workspaces
            </p>
            <Link
              to="/$view"
              params={{ view: 'workspaces' }}
              className="text-xs text-primary hover:underline font-medium"
            >
              Manage all →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {multiWorkspaces.data?.slice(0, 4).map((ws) => (
              <Link
                key={ws.id}
                to="/$view"
                params={{ view: 'workspaces' }}
                className="group flex items-center justify-between gap-3 rounded-lg border p-3 bg-card/40 transition-colors hover:bg-muted/60"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Layers className="size-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{ws.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ws.repos?.length ?? 0} repositories
                    </p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
      {Boolean(recent.data?.length) && (
        <div className="mt-6 border-t pt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Recent workspaces
          </p>
          {recent.data?.map((repo) => (
            <RecentWorkspaceItem key={repo.path} repo={repo} onOpen={(p) => void open(p)} />
          ))}
        </div>
      )}
    </div>
  );
}
