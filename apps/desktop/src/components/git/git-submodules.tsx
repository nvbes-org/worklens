import { useQuery } from '@tanstack/react-query';
import type { SubmoduleEntry } from '@worklens/contracts';
import { FolderOpen, FolderTree, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

export function GitSubmodules() {
  const { repo, open } = useSession();
  const git = useGit();
  const [addUrl, setAddUrl] = useState('');
  const [addPath, setAddPath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const submodulesQuery = useQuery({
    queryKey: ['git_submodules_list', repo?.path],
    queryFn: () => query<SubmoduleEntry[]>('git_action', repo?.path, { action: 'submodule_list' }),
    enabled: Boolean(repo),
  });

  const submodules = submodulesQuery.data ?? [];

  async function handleUpdate(path?: string) {
    if (!repo) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await query('git_action', repo.path, {
        action: 'submodule_update',
        path: path ?? null,
        recursive: true,
        init: true,
      });
      setFeedback('Submodules updated recursively.');
      await submodulesQuery.refetch();
      await git.refetch();
    } catch (e) {
      setFeedback(`Error updating: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleInit(path?: string) {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'submodule_init', path: path ?? null });
      setFeedback('Submodules initialized.');
      await submodulesQuery.refetch();
    } catch (e) {
      setFeedback(`Error initializing: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSync() {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'submodule_sync', recursive: true });
      setFeedback('Submodule URLs synchronized.');
      await submodulesQuery.refetch();
    } catch (e) {
      setFeedback(`Error syncing: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAdd() {
    if (!repo || !addUrl.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await query('git_action', repo.path, {
        action: 'submodule_add',
        url: addUrl.trim(),
        path: addPath.trim() || null,
      });
      setAddUrl('');
      setAddPath('');
      setFeedback('Submodule added successfully.');
      await submodulesQuery.refetch();
      await git.refetch();
    } catch (e) {
      setFeedback(`Error adding submodule: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeinit(path: string) {
    if (!repo || !confirm(`Deinitialize submodule at ${path}?`)) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'submodule_deinit', path, force: true });
      setFeedback(`Submodule ${path} deinitialized.`);
      await submodulesQuery.refetch();
    } catch (e) {
      setFeedback(`Error deinitializing: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const statusBadges: Record<string, { label: string; class: string }> = {
    up_to_date: {
      label: 'Up to date',
      class: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    },
    modified: {
      label: 'Modified',
      class: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    },
    uninitialized: {
      label: 'Uninitialized',
      class: 'bg-muted text-muted-foreground border-border',
    },
    conflict: {
      label: 'Merge Conflict',
      class: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    },
  };

  return (
    <div className="space-y-4">
      {/* Controls and Add */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FolderTree className="size-4 text-primary" /> Git Submodules
            </h3>
            <p className="text-xs text-muted-foreground">
              Manage embedded repositories, initialize recursive dependencies, and navigate submodules.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void handleUpdate()} disabled={isSubmitting}>
              <RefreshCw className="mr-1.5 size-3.5" /> Update Recursive
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleSync()} disabled={isSubmitting}>
              Sync URLs
            </Button>
          </div>
        </div>

        {/* Add submodule form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t">
          <input
            type="text"
            className="h-8 rounded-lg border bg-background px-3 text-xs font-mono"
            placeholder="Submodule repo URL (https://github.com/...)"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <input
              type="text"
              className="h-8 flex-1 rounded-lg border bg-background px-3 text-xs font-mono"
              placeholder="Destination path (e.g. libs/plugin)"
              value={addPath}
              onChange={(e) => setAddPath(e.target.value)}
            />
            <Button size="sm" onClick={() => void handleAdd()} disabled={isSubmitting || !addUrl.trim()}>
              <Plus className="mr-1.5 size-3.5" /> Add
            </Button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">{feedback}</div>
      )}

      {/* Submodules list */}
      <div className="rounded-xl border divide-y overflow-hidden">
        {submodules.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            No Git submodules found in this repository. Add one using the form above.
          </div>
        ) : (
          submodules.map((sub) => {
            const badge = statusBadges[sub.status] ?? statusBadges.up_to_date;
            const fullPath = repo ? `${repo.path}/${sub.path}` : sub.path;

            return (
              <div
                key={sub.path}
                className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-muted/5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{sub.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium border ${badge.class}`}
                    >
                      {badge.label}
                    </span>
                    {sub.branch && (
                      <span className="text-[11px] text-muted-foreground font-mono">({sub.branch})</span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Path: <strong className="text-foreground">{sub.path}</strong> ·{' '}
                    {sub.commit ? `Commit: ${sub.commit.slice(0, 8)}` : 'No commit checked out'}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate" title={sub.url}>
                    Remote: {sub.url}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => void open(fullPath)}
                    title="Open this submodule as active workspace in Worklens"
                  >
                    <FolderOpen className="mr-1.5 size-3.5" />
                    Open in Worklens
                  </Button>

                  {!sub.initialized && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleInit(sub.path)}
                      disabled={isSubmitting}
                    >
                      Init
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleUpdate(sub.path)}
                    disabled={isSubmitting}
                    title="Update this submodule"
                  >
                    Update
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2 text-rose-500 hover:text-rose-600"
                    onClick={() => void handleDeinit(sub.path)}
                    disabled={isSubmitting}
                    title="Deinitialize submodule"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
