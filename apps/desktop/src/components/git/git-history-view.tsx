import type { Commit, GitSnapshot } from '@worklens/contracts';
import { GitCommitHorizontal, Play, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ErrorNotice, Loading } from '../common';
import { type DiffSelection, GitDiff } from '../git-diff';
import { Button } from '../ui/button';
import { GitCherryPick } from './git-cherry-pick';

interface Props {
  historyData?: GitSnapshot;
  isPending: boolean;
  error: unknown;
  offset: number;
  onOffsetChange: (newOffset: number) => void;
  selection: DiffSelection | null;
  onSelectChange: (selection: DiffSelection) => void;
  onOpenEditor: (path: string) => void;
  onNavigateToRebase: () => void;
}

export function GitHistoryView({
  historyData,
  isPending,
  error,
  offset,
  onOffsetChange,
  selection,
  onSelectChange,
  onOpenEditor,
  onNavigateToRebase,
}: Props) {
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [showCherryPick, setShowCherryPick] = useState(false);

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} />
      {isPending && <Loading />}

      {showCherryPick && selectedCommit && (
        <GitCherryPick selectedCommit={selectedCommit} onDone={() => setShowCherryPick(false)} />
      )}

      <div className="git-workspace">
        <section className="history-list" aria-label="Commit history">
          {historyData?.commits.map((commit) => (
            <button
              key={commit.sha}
              type="button"
              onClick={() => {
                onSelectChange({ base: commit.parents[0], head: commit.sha });
                setSelectedCommit(commit);
              }}
              className={`history-row ${selection?.head === commit.sha ? 'selected' : ''}`}
            >
              <GitCommitHorizontal className="mt-1 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium truncate">{commit.subject}</p>
                  {commit.signatureStatus === 'G' && (
                    <span title="Valid cryptographic signature">
                      <ShieldCheck className="size-3.5 text-emerald-500 shrink-0" />
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {commit.author} · {commit.sha.slice(0, 7)}
                </p>
                <time className="text-[10px] text-muted-foreground">
                  {new Date(commit.date).toLocaleString()}
                </time>
              </div>
            </button>
          ))}
          {historyData?.commits.length === 0 && (
            <p className="p-5 text-sm text-muted-foreground">No commits yet.</p>
          )}
          <div className="flex justify-between gap-2 border-t p-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={offset === 0}
              onClick={() => onOffsetChange(Math.max(0, offset - 50))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={historyData?.nextOffset == null}
              onClick={() => onOffsetChange(historyData?.nextOffset ?? 0)}
            >
              Next 50
            </Button>
          </div>
        </section>

        <div className="flex flex-col gap-2 flex-1">
          {selectedCommit && (
            <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-muted/20 text-xs">
              <span className="font-mono truncate">
                {selectedCommit.sha.slice(0, 7)}: <strong>{selectedCommit.subject}</strong>
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant={showCherryPick ? 'secondary' : 'outline'}
                  className="h-7 text-xs px-2"
                  onClick={() => setShowCherryPick(!showCherryPick)}
                >
                  <Play className="mr-1 size-3" /> Cherry-pick
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={onNavigateToRebase}>
                  Rebase onto
                </Button>
              </div>
            </div>
          )}
          <GitDiff selection={selection} onOpenEditor={onOpenEditor} />
        </div>
      </div>
    </div>
  );
}
