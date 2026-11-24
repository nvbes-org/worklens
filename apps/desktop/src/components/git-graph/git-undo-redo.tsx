import type { ReflogEntry } from '@worklens/contracts';
import { History, Loader2, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

export interface RecordedAction {
  id: string;
  description: string;
  undoAction: () => Promise<void>;
  redoAction?: () => Promise<void>;
}

// Global action history stack within the session
let undoStack: RecordedAction[] = [];
let redoStack: RecordedAction[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function recordGitAction(action: RecordedAction) {
  undoStack = [action, ...undoStack].slice(0, 30);
  redoStack = [];
  notify();
}

export function GitUndoRedo() {
  const { repo } = useSession();
  const git = useGit();
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showReflog, setShowReflog] = useState(false);
  const [reflogEntries, setReflogEntries] = useState<ReflogEntry[]>([]);
  const [reflogLoading, setReflogLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Subscribe to changes in undo/redo stack
  useState(() => {
    const cb = () => setTick((t) => t + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  });

  const lastUndo = undoStack[0];
  const lastRedo = redoStack[0];

  async function handleUndo() {
    if (!lastUndo || !repo) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      await lastUndo.undoAction();
      undoStack = undoStack.slice(1);
      if (lastUndo.redoAction) {
        redoStack = [lastUndo, ...redoStack];
      }
      notify();
      await git.refetch();
      setStatusMessage(`Undone: ${lastUndo.description}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRedo() {
    if (!lastRedo?.redoAction || !repo) return;
    setLoading(true);
    setStatusMessage(null);
    try {
      await lastRedo.redoAction();
      redoStack = redoStack.slice(1);
      undoStack = [lastRedo, ...undoStack];
      notify();
      await git.refetch();
      setStatusMessage(`Redone: ${lastRedo.description}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  // Fallback 1-click reflog undo: soft reset HEAD~1
  async function handleQuickUndoCommit() {
    if (!repo) return;
    setLoading(true);
    try {
      await query('git_action', repo.path, { action: 'reset', mode: 'soft', target: 'HEAD~1' });
      await git.refetch();
      setStatusMessage('Undone last commit (staged changes preserved)');
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function toggleReflog() {
    if (!showReflog && repo) {
      setReflogLoading(true);
      try {
        const entries = await query<ReflogEntry[]>('git_reflog', repo.path, { limit: 15 });
        setReflogEntries(entries);
      } catch (err) {
        setStatusMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setReflogLoading(false);
      }
    }
    setShowReflog(!showReflog);
  }

  async function restoreToReflog(entry: ReflogEntry) {
    if (!repo) return;
    if (!window.confirm(`Restore repository state to ${entry.selector} (${entry.action})?`)) return;
    setLoading(true);
    try {
      await query('git_action', repo.path, { action: 'reset', mode: 'mixed', target: entry.sha });
      await git.refetch();
      setShowReflog(false);
      setStatusMessage(`Restored to ${entry.selector}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={() => (lastUndo ? void handleUndo() : void handleQuickUndoCommit())}
        disabled={loading}
        title={lastUndo ? `Undo: ${lastUndo.description}` : 'Undo last commit (reset soft HEAD~1)'}
        className="h-7 text-xs px-2 gap-1"
      >
        <Undo2 className="size-3.5 text-amber-500" />
        <span>Undo</span>
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleRedo()}
        disabled={loading || !lastRedo}
        title={lastRedo ? `Redo: ${lastRedo.description}` : 'Nothing to redo'}
        className="h-7 text-xs px-2 gap-1"
      >
        <Redo2 className="size-3.5 text-blue-500" />
        <span>Redo</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void toggleReflog()}
        title="Git Reflog / Action History"
        className="h-7 w-7 p-0"
      >
        <History className="size-3.5 text-muted-foreground" />
      </Button>

      {statusMessage && (
        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 animate-in fade-in">
          {statusMessage}
        </span>
      )}

      {showReflog && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-xl border bg-card p-3 shadow-xl text-card-foreground">
          <div className="flex items-center justify-between pb-2 mb-2 border-b">
            <h4 className="text-xs font-semibold flex items-center gap-1.5">
              <History className="size-3.5 text-primary" />
              Reflog Action History
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] px-1.5"
              onClick={() => setShowReflog(false)}
            >
              Close
            </Button>
          </div>
          {reflogLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> Loading history...
            </div>
          ) : reflogEntries.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No recent reflog entries.</p>
          ) : (
            <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-border/50">
              {reflogEntries.map((entry) => (
                <div
                  key={entry.selector}
                  className="pt-1.5 first:pt-0 pb-1 flex items-start justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 text-[11px] font-mono text-primary font-medium">
                      <span>{entry.selector}</span>
                      <span className="text-muted-foreground text-[10px]">({entry.sha.slice(0, 7)})</span>
                    </div>
                    <p className="truncate text-[11px] text-foreground" title={entry.action}>
                      {entry.action}
                    </p>
                    <time className="text-[9px] text-muted-foreground">{entry.date}</time>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                    onClick={() => void restoreToReflog(entry)}
                    title={`Reset HEAD to ${entry.selector}`}
                  >
                    <RotateCcw className="size-3 mr-1" />
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
