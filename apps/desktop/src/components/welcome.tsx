import { useQuery } from '@tanstack/react-query';
import { isTauri } from '@tauri-apps/api/core';
import type { Repository } from '@worklens/contracts';
import { ArrowRight, FolderOpen, GitBranch, Network } from 'lucide-react';
import { useState } from 'react';
import { query } from '../lib/api';
import { useSession } from '../lib/session';
import { ErrorNotice } from './common';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function Welcome() {
  const { open, error } = useSession();
  const [path, setPath] = useState('');
  const [browseError, setBrowseError] = useState('');
  const recent = useQuery({ queryKey: ['recent'], queryFn: () => query<Repository[]>('recent') });
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
        className="mt-8 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void open(path);
        }}
      >
        <Input
          aria-label="Repository path"
          placeholder="/path/to/your/repository"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <Button type="submit" disabled={!path.trim()}>
          Open repository
          <ArrowRight className="size-4" />
        </Button>
        <Button type="button" variant="ghost" className="self-start" onClick={() => void browse()}>
          <FolderOpen className="size-4" />
          Browse folders
        </Button>
      </form>
      <ErrorNotice error={error || browseError || recent.error} />
      {Boolean(recent.data?.length) && (
        <div className="mt-6 border-t pt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Recent workspaces
          </p>
          {recent.data?.map((repo) => (
            <button
              type="button"
              key={repo.path}
              className="flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-muted"
              onClick={() => void open(repo.path)}
            >
              <span className="font-medium">{repo.name}</span>
              <span className="text-xs text-muted-foreground">{repo.path}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-12 flex gap-8 border-t pt-6 text-xs text-muted-foreground">
        <span className="flex gap-2">
          <GitBranch className="size-4" />
          Parallel worktrees
        </span>
        <span className="flex gap-2">
          <Network className="size-4" />
          Component architecture
        </span>
      </div>
    </div>
  );
}
