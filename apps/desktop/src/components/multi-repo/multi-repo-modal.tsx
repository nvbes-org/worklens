import { useQuery } from '@tanstack/react-query';
import { isTauri } from '@tauri-apps/api/core';
import type { MultiRepoWorkspace, Repository, WorkspaceRepoEntry } from '@worklens/contracts';
import { FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { query } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';

interface MultiRepoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace?: MultiRepoWorkspace | null;
  onSave: (ws: MultiRepoWorkspace) => Promise<void>;
}

export function MultiRepoModal({ open, onOpenChange, workspace, onSave }: MultiRepoModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repos, setRepos] = useState<WorkspaceRepoEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const recent = useQuery({
    queryKey: ['recent'],
    queryFn: () => query<Repository[]>('recent'),
    enabled: open,
  });

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setDescription(workspace.description ?? '');
      setRepos(workspace.repos ?? []);
    } else {
      setName('');
      setDescription('');
      setRepos([]);
    }
    setError(null);
  }, [workspace, open]);

  function addRepoRow() {
    setRepos((prev) => [
      ...prev,
      {
        id: `repo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: '',
        path: '',
        remoteUrl: null,
        defaultBranch: 'main',
      },
    ]);
  }

  function addRecentRepo(r: Repository) {
    if (repos.some((entry) => entry.path === r.path)) return;
    setRepos((prev) => [
      ...prev,
      {
        id: `repo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: r.name,
        path: r.path,
        remoteUrl: null,
        defaultBranch: 'main',
      },
    ]);
  }

  function updateRepo(index: number, patch: Partial<WorkspaceRepoEntry>) {
    setRepos((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function removeRepo(index: number) {
    setRepos((prev) => prev.filter((_, i) => i !== index));
  }

  async function browseFolder(index: number) {
    if (!isTauri()) return;
    try {
      const { open: choose } = await import('@tauri-apps/plugin-dialog');
      const selected = await choose({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        const folderName = selected.split('/').filter(Boolean).pop() ?? 'repo';
        updateRepo(index, {
          path: selected,
          name: repos[index].name ? repos[index].name : folderName,
        });
      }
    } catch {
      // Ignore user cancellation
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Workspace name is required');
      return;
    }
    const cleanRepos = repos.filter((r) => r.path.trim().length > 0).map((r) => ({
      ...r,
      name: r.name.trim() || r.path.split('/').filter(Boolean).pop() || 'repo',
      path: r.path.trim(),
    }));

    if (cleanRepos.length === 0) {
      setError('Please add at least one repository to the workspace');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated: MultiRepoWorkspace = {
        id: workspace?.id ?? `ws-${Date.now()}`,
        name: name.trim(),
        description: description.trim() || null,
        repos: cleanRepos,
        createdAt: workspace?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await onSave(updated);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const unaddedRecent = (recent.data ?? []).filter((r) => !repos.some((entry) => entry.path === r.path));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{workspace ? 'Edit Multi-Repo Workspace' : 'Create Multi-Repo Workspace'}</DialogTitle>
          <DialogDescription>
            Group repositories into a unified workspace to track branches, commits, and run batch actions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 space-y-4">
          <div className="space-y-3">
            <div>
              <label htmlFor="ws-name" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Workspace Name
              </label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Microservices Suite, Frontend + Backend"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="ws-desc" className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Description (Optional)
              </label>
              <Input
                id="ws-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of included repositories"
                className="mt-1 text-sm"
              />
            </div>
          </div>

          {unaddedRecent.length > 0 && (
            <div className="rounded-lg border p-2.5 bg-muted/40">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">
                Quick add from recent repositories:
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {unaddedRecent.map((r) => (
                  <button
                    key={r.path}
                    type="button"
                    onClick={() => addRecentRepo(r)}
                    className="text-xs px-2.5 py-1 rounded-md bg-background border hover:bg-muted text-foreground flex items-center gap-1 transition-colors"
                  >
                    <Plus className="size-3 text-muted-foreground" />
                    <span className="font-medium">{r.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-[140px]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Repositories ({repos.length})
              </span>
              <Button type="button" variant="outline" size="xs" onClick={addRepoRow} className="gap-1 text-xs">
                <Plus className="size-3" />
                Add Repository
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg p-2 space-y-2 bg-background/50">
              {repos.length === 0 ? (
                <div className="h-28 flex flex-col items-center justify-center text-xs text-muted-foreground">
                  <span>No repositories added yet.</span>
                  <span className="mt-1">Click "Add Repository" or choose from recent above.</span>
                </div>
              ) : (
                repos.map((repo, idx) => (
                  <div key={repo.id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/20">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        placeholder="Repository name (e.g. auth-service)"
                        value={repo.name}
                        onChange={(e) => updateRepo(idx, { name: e.target.value })}
                        className="h-8 text-xs font-medium"
                      />
                      <div className="flex gap-1">
                        <Input
                          placeholder="/path/to/repo"
                          value={repo.path}
                          onChange={(e) => updateRepo(idx, { path: e.target.value })}
                          className="h-8 text-xs font-mono flex-1"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="h-8 w-8 text-muted-foreground"
                          title="Browse directory"
                          onClick={() => void browseFolder(idx)}
                        >
                          <FolderOpen className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-destructive h-8 w-8"
                      title="Remove"
                      onClick={() => removeRepo(idx)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {error && <div className="text-xs text-destructive bg-destructive/10 p-2 rounded-md">{error}</div>}

          <DialogFooter className="pt-2 border-t">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : workspace ? 'Save Changes' : 'Create Workspace'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
