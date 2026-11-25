import type { Worktree } from '@worklens/contracts';
import { FolderGit2, FolderOpen, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

export function GitWorktrees() {
  const { repo, open } = useSession();
  const git = useGit();
  const [pathInput, setPathInput] = useState('');
  const [branchInput, setBranchInput] = useState('');
  const [isNewBranch, setIsNewBranch] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const worktrees = git.data?.worktrees ?? [];

  async function handleAddWorktree() {
    if (!repo || !pathInput.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await query('git_action', repo.path, {
        action: 'worktree_add',
        path: pathInput.trim(),
        branch: !isNewBranch && branchInput.trim() ? branchInput.trim() : null,
        new_branch: isNewBranch && branchInput.trim() ? branchInput.trim() : null,
      });
      setPathInput('');
      setBranchInput('');
      setFeedback('Worktree created successfully.');
      await git.refetch();
    } catch (e) {
      setFeedback(`Error adding worktree: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(path: string) {
    if (!repo || !confirm(`Remove worktree at ${path}?`)) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, {
        action: 'worktree_remove',
        path,
        force: false,
      });
      setFeedback('Worktree removed.');
      await git.refetch();
    } catch (e) {
      setFeedback(`Error removing worktree: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleLock(tree: Worktree) {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      if (tree.locked) {
        await query('git_action', repo.path, { action: 'worktree_unlock', path: tree.path });
        setFeedback('Worktree unlocked.');
      } else {
        await query('git_action', repo.path, { action: 'worktree_lock', path: tree.path });
        setFeedback('Worktree locked.');
      }
      await git.refetch();
    } catch (e) {
      setFeedback(`Error toggling lock: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePrune() {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'worktree_prune' });
      setFeedback('Pruned stale worktrees.');
      await git.refetch();
    } catch (e) {
      setFeedback(`Error pruning: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold mb-2">Create Independent Worktree</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Check out another branch in a separate folder without disturbing your current workspace.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label
              htmlFor="worktree-path-input"
              className="block text-xs font-medium text-muted-foreground mb-1"
            >
              Target Directory Path
            </label>
            <input
              id="worktree-path-input"
              type="text"
              className="h-8 w-full rounded-lg border bg-background px-3 text-xs font-mono"
              placeholder="../my-repo-hotfix"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="worktree-branch-input"
                className="block text-xs font-medium text-muted-foreground"
              >
                Branch
              </label>
              <label className="text-[11px] text-muted-foreground flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isNewBranch}
                  onChange={(e) => setIsNewBranch(e.target.checked)}
                />
                Create new branch (-b)
              </label>
            </div>
            <input
              id="worktree-branch-input"
              type="text"
              className="h-8 w-full rounded-lg border bg-background px-3 text-xs font-mono"
              placeholder={isNewBranch ? 'new-feature-branch' : 'existing-branch (optional)'}
              value={branchInput}
              onChange={(e) => setBranchInput(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => void handleAddWorktree()}
            disabled={isSubmitting || !pathInput.trim()}
          >
            <Plus className="mr-1.5 size-3.5" /> Create Worktree
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">{feedback}</div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Active Worktrees ({worktrees.length})
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs"
          onClick={() => void handlePrune()}
          disabled={isSubmitting}
        >
          Prune Stale
        </Button>
      </div>

      <div className="rounded-xl border divide-y overflow-hidden">
        {worktrees.map((tree) => {
          const isCurrent = tree.path === repo?.path;
          return (
            <div key={tree.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FolderGit2 className="size-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm">{tree.branch ?? 'Detached HEAD'}</span>
                  {isCurrent && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      Active Workspace
                    </span>
                  )}
                  {tree.locked && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-500/20 flex items-center gap-1">
                      <Lock className="size-2.5" /> Locked
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={tree.path}>
                  {tree.path}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant={isCurrent ? 'secondary' : 'default'}
                  disabled={isCurrent}
                  onClick={() => void open(tree.path)}
                >
                  <FolderOpen className="mr-1.5 size-3.5" />
                  {isCurrent ? 'Current' : 'Switch Workspace'}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="px-2"
                  onClick={() => void handleToggleLock(tree)}
                  disabled={isSubmitting}
                  title={tree.locked ? 'Unlock worktree' : 'Lock worktree'}
                >
                  {tree.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
                </Button>

                {!isCurrent && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-2 text-rose-500 hover:text-rose-600"
                    onClick={() => void handleRemove(tree.path)}
                    disabled={isSubmitting}
                    title="Remove this worktree"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
