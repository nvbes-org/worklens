import type { JsonValue } from '@worklens/contracts';
import { ArrowRight, GitBranch, GitMerge, GitPullRequest, Loader2, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

export interface DragDropPair {
  source: string;
  target: string;
}

interface Props {
  pair: DragDropPair | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function BranchDragDropModal({ pair, onClose, onSuccess }: Props) {
  const { repo } = useSession();
  const git = useGit();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pair) return null;
  const currentPair = pair;

  async function handleAction(action: string, extraParams: Record<string, JsonValue> = {}) {
    if (!repo) return;
    setLoading(true);
    setError(null);
    try {
      if (action === 'merge') {
        // First checkout target if not already on it
        if (git.data?.branch !== currentPair.target) {
          await query('git_action', repo.path, { action: 'checkout', branch: currentPair.target });
        }
        await query('git_action', repo.path, {
          action: 'merge',
          branch: currentPair.source,
          ...extraParams,
        });
        onSuccess(`Merged ${currentPair.source} into ${currentPair.target}`);
      } else if (action === 'rebase') {
        if (git.data?.branch !== currentPair.target) {
          await query('git_action', repo.path, { action: 'checkout', branch: currentPair.target });
        }
        await query('git_action', repo.path, {
          action: 'rebase',
          upstream: currentPair.source,
        });
        onSuccess(`Rebased ${currentPair.target} onto ${currentPair.source}`);
      } else if (action === 'push') {
        await query('git_action', repo.path, {
          action: 'push',
          remote: 'origin',
          branch: currentPair.target,
        });
        onSuccess(`Pushed ${currentPair.target} to origin`);
      }
      await git.refetch();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl text-card-foreground">
        <header className="mb-4">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <GitBranch className="size-4 text-primary" />
            Branch Drag & Drop Actions
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Choose what action to perform between these branches.
          </p>
        </header>

        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/40 mb-5 text-xs font-mono">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <GitBranch className="size-3.5 text-blue-500" />
            {pair.source}
          </span>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <GitBranch className="size-3.5 text-emerald-500" />
            {pair.target}
          </span>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start h-auto py-2.5 px-3 text-left"
            onClick={() => void handleAction('merge', { mode: 'default' })}
            disabled={loading}
          >
            <GitMerge className="size-4 mr-2.5 text-primary shrink-0" />
            <div>
              <div className="text-xs font-medium">Merge into {pair.target}</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                Merge changes from {pair.source} into {pair.target}
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start h-auto py-2.5 px-3 text-left"
            onClick={() => void handleAction('merge', { mode: 'ff_only' })}
            disabled={loading}
          >
            <ArrowRight className="size-4 mr-2.5 text-emerald-500 shrink-0" />
            <div>
              <div className="text-xs font-medium">Fast-Forward {pair.target}</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                Fast-forward {pair.target} to match {pair.source} (no merge commit)
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start h-auto py-2.5 px-3 text-left"
            onClick={() => void handleAction('rebase')}
            disabled={loading}
          >
            <GitPullRequest className="size-4 mr-2.5 text-purple-500 shrink-0" />
            <div>
              <div className="text-xs font-medium">
                Rebase {pair.target} onto {pair.source}
              </div>
              <div className="text-[10px] text-muted-foreground font-normal">
                Reapply commits of {pair.target} on top of {pair.source}
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start h-auto py-2.5 px-3 text-left"
            onClick={() => void handleAction('push')}
            disabled={loading}
          >
            <UploadCloud className="size-4 mr-2.5 text-amber-500 shrink-0" />
            <div>
              <div className="text-xs font-medium">Push {pair.target} to Remote</div>
              <div className="text-[10px] text-muted-foreground font-normal">
                Push current branch refs to origin
              </div>
            </div>
          </Button>
        </div>

        <footer className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Executing...
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
