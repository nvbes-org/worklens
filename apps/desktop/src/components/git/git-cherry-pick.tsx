import { useQuery } from '@tanstack/react-query';
import type { Commit } from '@worklens/contracts';
import { AlertCircle, CheckCircle2, GitCommitHorizontal, Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

interface GitCherryPickProps {
  selectedCommit?: Commit | null;
  onDone?: () => void;
}

export function GitCherryPick({ selectedCommit, onDone }: GitCherryPickProps) {
  const { repo } = useSession();
  const git = useGit();
  const [sha, setSha] = useState(selectedCommit?.sha ?? '');
  const [noCommit, setNoCommit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const statusQuery = useQuery({
    queryKey: ['git_cherry_pick_status', repo?.path],
    queryFn: () =>
      query<{ in_progress: boolean; sha?: string | null }>('git_action', repo?.path, {
        action: 'cherry_pick_status',
      }),
    enabled: Boolean(repo),
    refetchInterval: 3000,
  });

  const inProgress = statusQuery.data?.in_progress;

  async function handleCherryPick() {
    if (!repo || !sha.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await query<{
        success: boolean;
        conflict?: boolean;
        output?: string;
        error?: string;
      }>('git_action', repo.path, {
        action: 'cherry_pick',
        sha: sha.trim(),
        no_commit: noCommit,
      });

      if (res.conflict) {
        setFeedback({
          success: false,
          message: 'Cherry-pick resulted in conflicts. Resolve conflicts, then continue or abort.',
        });
      } else if (!res.success) {
        setFeedback({
          success: false,
          message: res.error || 'Cherry-pick failed.',
        });
      } else {
        setFeedback({
          success: true,
          message: `Commit ${sha.slice(0, 7)} cherry-picked successfully.`,
        });
        await git.refetch();
        onDone?.();
      }
      await statusQuery.refetch();
    } catch (e) {
      setFeedback({ success: false, message: String(e) });
      await statusQuery.refetch();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAbort() {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'cherry_pick_abort' });
      setFeedback({ success: true, message: 'Cherry-pick aborted.' });
      await git.refetch();
      await statusQuery.refetch();
    } catch (e) {
      setFeedback({ success: false, message: String(e) });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleContinue() {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'cherry_pick_continue' });
      setFeedback({ success: true, message: 'Cherry-pick continued.' });
      await git.refetch();
      await statusQuery.refetch();
      onDone?.();
    } catch (e) {
      setFeedback({ success: false, message: String(e) });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Cherry-pick Commit</h3>
          <p className="text-xs text-muted-foreground">
            Apply changes from any commit onto active branch{' '}
            <strong className="text-foreground">{git.data?.branch ?? 'HEAD'}</strong>.
          </p>
        </div>
      </div>

      {inProgress && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
            <AlertCircle className="size-4 shrink-0" />
            <span>Cherry-pick conflict in progress</span>
          </div>
          <p className="text-muted-foreground">
            Resolve conflicts in your working tree, then continue or abort.
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => void handleContinue()} disabled={isSubmitting}>
              <Play className="mr-1.5 size-3" /> Continue
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleAbort()} disabled={isSubmitting}>
              <RotateCcw className="mr-1.5 size-3" /> Abort
            </Button>
          </div>
        </div>
      )}

      {selectedCommit && (
        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/20 p-2.5 text-xs">
          <GitCommitHorizontal className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{selectedCommit.subject}</p>
            <p className="text-[11px] text-muted-foreground">
              {selectedCommit.author} · {selectedCommit.sha.slice(0, 7)}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="cherry-pick-sha" className="block text-xs font-medium text-muted-foreground">
          Commit SHA
        </label>
        <input
          id="cherry-pick-sha"
          type="text"
          className="h-8 w-full rounded-lg border bg-background px-3 text-xs font-mono"
          placeholder="e.g. 7f8a9b2c..."
          value={sha}
          onChange={(e) => setSha(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="no-commit-check"
          checked={noCommit}
          onChange={(e) => setNoCommit(e.target.checked)}
          className="rounded border"
        />
        <label htmlFor="no-commit-check" className="text-xs text-muted-foreground cursor-pointer">
          Stage only without committing (<code className="font-mono text-[11px]">-n / --no-commit</code>)
        </label>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg p-2.5 text-xs ${
            feedback.success
              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'
          }`}
        >
          {feedback.success ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      <Button
        size="sm"
        className="w-full"
        onClick={() => void handleCherryPick()}
        disabled={isSubmitting || !sha.trim() || inProgress}
      >
        <Play className="mr-1.5 size-3.5" />
        Apply Cherry-pick to {git.data?.branch ?? 'HEAD'}
      </Button>
    </div>
  );
}
