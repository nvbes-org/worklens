import { useQuery } from '@tanstack/react-query';
import type { RebaseItem, RebaseStatus } from '@worklens/contracts';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Play,
  RotateCcw,
  SkipForward,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

export function GitRebase() {
  const { repo } = useSession();
  const git = useGit();
  const [upstream, setUpstream] = useState('HEAD~5');
  const [items, setItems] = useState<RebaseItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ['git_rebase_status', repo?.path],
    queryFn: () => query<RebaseStatus>('git_action', repo?.path, { action: 'rebase_status' }),
    enabled: Boolean(repo),
    refetchInterval: 3000,
  });

  const rebaseStatus = statusQuery.data;

  async function loadCommits() {
    if (!repo) return;
    setStatusMessage(null);
    try {
      const res = await query<RebaseItem[]>('git_action', repo.path, {
        action: 'rebase_commits',
        upstream: upstream.trim() || 'HEAD~5',
      });
      setItems(res);
      if (res.length === 0) {
        setStatusMessage('No commits found in the specified range.');
      }
    } catch (e) {
      setStatusMessage(`Error loading commits: ${String(e)}`);
    }
  }

  useEffect(() => {
    if (repo && items.length === 0 && !rebaseStatus?.inProgress) {
      void loadCommits();
    }
  }, [repo, rebaseStatus?.inProgress]);

  function moveItem(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= items.length) return;
    const updated = [...items];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setItems(updated);
  }

  function updateAction(index: number, action: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, action } : item)));
  }

  function updateMessage(index: number, message: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, message } : item)));
  }

  async function executeRebase() {
    if (!repo || items.length === 0) return;
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      await query('git_action', repo.path, {
        action: 'rebase_apply',
        upstream: upstream.trim() || 'HEAD~5',
        items,
      });
      setStatusMessage('Interactive rebase completed successfully.');
      await git.refetch();
      await statusQuery.refetch();
      await loadCommits();
    } catch (e) {
      setStatusMessage(`Rebase halted or encountered conflict: ${String(e)}`);
      await statusQuery.refetch();
      await git.refetch();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAbort() {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'rebase_abort' });
      setStatusMessage('Rebase aborted.');
      await git.refetch();
      await statusQuery.refetch();
      await loadCommits();
    } catch (e) {
      setStatusMessage(`Error aborting: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleContinue() {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'rebase_continue' });
      setStatusMessage('Rebase continued.');
      await git.refetch();
      await statusQuery.refetch();
    } catch (e) {
      setStatusMessage(`Error continuing: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkip() {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'rebase_skip' });
      setStatusMessage('Commit skipped.');
      await git.refetch();
      await statusQuery.refetch();
    } catch (e) {
      setStatusMessage(`Error skipping: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const actionColors: Record<string, string> = {
    pick: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    reword: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    edit: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    squash: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
    fixup: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
    drop: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
  };

  return (
    <div className="space-y-4">
      {rebaseStatus?.inProgress && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              Interactive rebase in progress{' '}
              {rebaseStatus.step ? `(step ${rebaseStatus.step}/${rebaseStatus.total ?? '?'})` : ''}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {rebaseStatus.currentCommit && `Stopped at commit: ${rebaseStatus.currentCommit.slice(0, 8)}. `}
            Resolve any merge conflicts, then continue, skip, or abort.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void handleContinue()} disabled={isSubmitting}>
              <Play className="mr-1.5 size-3.5" /> Continue
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleSkip()} disabled={isSubmitting}>
              <SkipForward className="mr-1.5 size-3.5" /> Skip
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void handleAbort()}
              disabled={isSubmitting}
            >
              <RotateCcw className="mr-1.5 size-3.5" /> Abort
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Rebase onto:</span>
          <input
            type="text"
            className="h-8 rounded-lg border bg-background px-2.5 text-xs font-mono"
            value={upstream}
            onChange={(e) => setUpstream(e.target.value)}
            placeholder="e.g. main or HEAD~5"
          />
          <Button size="sm" variant="outline" onClick={() => void loadCommits()} disabled={isSubmitting}>
            Load Commits
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => void executeRebase()}
            disabled={isSubmitting || items.length === 0 || rebaseStatus?.inProgress}
          >
            <Play className="mr-1.5 size-3.5" /> Apply Interactive Rebase
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          {statusMessage}
        </div>
      )}

      <ul className="rounded-xl border divide-y overflow-hidden">
        {items.length === 0 ? (
          <li className="p-8 text-center text-xs text-muted-foreground list-none">
            No commits to rebase. Specify a base reference (e.g. main or HEAD~5) and click Load Commits.
          </li>
        ) : (
          items.map((item, index) => (
            <li
              key={item.sha}
              draggable={!rebaseStatus?.inProgress}
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggedIndex !== null && draggedIndex !== index) {
                  moveItem(draggedIndex, index);
                  setDraggedIndex(null);
                }
              }}
              className={`flex flex-col gap-2 p-3 text-xs transition-colors ${
                draggedIndex === index ? 'opacity-40 bg-muted/20' : 'hover:bg-muted/10'
              } ${item.action === 'drop' ? 'opacity-50 line-through' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="cursor-grab text-muted-foreground active:cursor-grabbing hover:text-foreground"
                    title="Drag to reorder"
                  >
                    <GripVertical className="size-4" />
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                      onClick={() => moveItem(index, index - 1)}
                      disabled={index === 0}
                      title="Move up"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20"
                      onClick={() => moveItem(index, index + 1)}
                      disabled={index === items.length - 1}
                      title="Move down"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">{item.sha.slice(0, 7)}</span>
                  <span className="truncate font-medium">{item.subject}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={item.action}
                    onChange={(e) => updateAction(index, e.target.value)}
                    className={`h-7 rounded-md border px-2 text-xs font-medium uppercase tracking-wide outline-none ${
                      actionColors[item.action] ?? ''
                    }`}
                  >
                    <option value="pick">pick</option>
                    <option value="reword">reword</option>
                    <option value="edit">edit</option>
                    <option value="squash">squash</option>
                    <option value="fixup">fixup</option>
                    <option value="drop">drop</option>
                  </select>
                </div>
              </div>

              {item.action === 'reword' && (
                <div className="pl-12 pr-2">
                  <input
                    type="text"
                    className="w-full rounded border bg-background px-2.5 py-1 text-xs"
                    placeholder="New commit message..."
                    value={item.message ?? item.subject}
                    onChange={(e) => updateMessage(index, e.target.value)}
                  />
                </div>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
