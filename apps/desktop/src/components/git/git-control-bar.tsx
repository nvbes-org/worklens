import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  Edit3,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Tag as TagIcon,
  Terminal,
} from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { GitUndoRedo } from '../git-graph/git-undo-redo';
import { Button } from '../ui/button';

interface Props {
  activeView: string;
  onSelectView: (view: string) => void;
  changesCount: number;
  conflictsCount: number;
  onOpenNewBranch: () => void;
  onOpenNewTag: () => void;
  onOpenStashSave: () => void;
  onToggleTerminal: () => void;
  isTerminalOpen: boolean;
}

export function GitControlBar({
  activeView,
  onSelectView,
  changesCount,
  conflictsCount,
  onOpenNewBranch,
  onOpenNewTag,
  onOpenStashSave,
  onToggleTerminal,
  isTerminalOpen,
}: Props) {
  const { repo } = useSession();
  const git = useGit();
  const [fetching, setFetching] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [showPullMenu, setShowPullMenu] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeBranchName = git.data?.branch ?? 'Detached HEAD';
  const activeBranch = git.data?.branches.find((b) => b.name === activeBranchName);
  const tracking = activeBranch?.tracking ?? '';
  const isAhead = tracking.includes('ahead');
  const isBehind = tracking.includes('behind');

  function showNotification(msg: string) {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3500);
  }

  async function handleFetch() {
    if (!repo || fetching) return;
    setFetching(true);
    try {
      await query('git_action', repo.path, { action: 'fetch', prune: true });
      await git.refetch();
      showNotification('Fetched latest remote refs and pruned stale branches.');
    } catch (err) {
      alert(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFetching(false);
    }
  }

  async function handlePull(mode: 'default' | 'rebase' | 'ff_only' = 'default') {
    if (!repo || pulling) return;
    setPulling(true);
    setShowPullMenu(false);
    try {
      await query('git_action', repo.path, {
        action: 'pull',
        rebase: mode === 'rebase',
        ff_only: mode === 'ff_only',
      });
      await git.refetch();
      showNotification(`Pulled changes successfully (${mode}).`);
    } catch (err) {
      alert(`Pull failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPulling(false);
    }
  }

  async function handlePush(force = false) {
    if (!repo || pushing) return;
    if (force && !window.confirm('Force push with lease to remote?')) return;
    setPushing(true);
    try {
      await query('git_action', repo.path, { action: 'push', force });
      await git.refetch();
      showNotification('Pushed commits to remote repository.');
    } catch (err) {
      alert(`Push failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setPushing(false);
    }
  }

  async function handleStashPop() {
    if (!repo) return;
    try {
      await query('git_action', repo.path, { action: 'stash_pop', selector: 'stash@{0}' });
      await git.refetch();
      showNotification('Applied and dropped latest stash.');
    } catch (err) {
      alert(`Stash Pop failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 pb-2 border-b mb-3 select-none">
      {/* Top Studio Control Ribbon */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Active Branch & Sync Hub */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-card text-xs font-semibold text-foreground shadow-2xs">
            <GitBranch className="size-3.5 text-primary" />
            <span className="font-mono">{activeBranchName}</span>
            {tracking && (
              <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-muted font-mono text-muted-foreground">
                {tracking.replace('ahead ', '↑').replace('behind ', '↓')}
              </span>
            )}
          </div>

          {/* 1-Click Fast Sync button if ahead or behind */}
          {(isAhead || isBehind) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5 text-primary border-primary/30 hover:bg-primary/10 gap-1"
              onClick={() => {
                if (isBehind) void handlePull();
                else if (isAhead) void handlePush();
              }}
              disabled={pulling || pushing}
            >
              <RefreshCw className={`size-3 ${pulling || pushing ? 'animate-spin' : ''}`} />
              <span>Sync ({isBehind ? 'Pull' : 'Push'})</span>
            </Button>
          )}

          {/* Universal Undo / Redo */}
          <GitUndoRedo />
        </div>

        {/* Center/Right: Git Core Operations Group */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Fetch */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleFetch}
            disabled={fetching}
            title="Fetch all remotes and prune deleted branches"
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${fetching ? 'animate-spin text-primary' : ''}`} />
            <span>Fetch</span>
          </Button>

          {/* Pull with Dropdown */}
          <div className="relative inline-flex rounded-md shadow-2xs">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePull('default')}
              disabled={pulling}
              title="Pull changes from remote tracking branch"
              className="h-8 text-xs gap-1.5 rounded-r-none border-r-0"
            >
              <ArrowDownToLine className={`size-3.5 ${pulling ? 'animate-bounce text-primary' : ''}`} />
              <span>Pull</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPullMenu(!showPullMenu)}
              disabled={pulling}
              className="h-8 px-1.5 rounded-l-none"
            >
              <ChevronDown className="size-3" />
            </Button>

            {showPullMenu && (
              <div className="absolute top-9 left-0 z-50 w-44 rounded-lg border bg-popover p-1 shadow-lg text-xs space-y-0.5">
                <button
                  type="button"
                  onClick={() => void handlePull('default')}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted text-foreground"
                >
                  Standard Merge Pull
                </button>
                <button
                  type="button"
                  onClick={() => void handlePull('rebase')}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted text-foreground"
                >
                  Pull with Rebase (--rebase)
                </button>
                <button
                  type="button"
                  onClick={() => void handlePull('ff_only')}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-muted text-foreground"
                >
                  Fast-Forward Only (--ff-only)
                </button>
              </div>
            )}
          </div>

          {/* Push */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handlePush(false)}
            disabled={pushing}
            title="Push committed changes to remote repository"
            className="h-8 text-xs gap-1.5"
          >
            <ArrowUpFromLine className={`size-3.5 ${pushing ? 'animate-bounce text-primary' : ''}`} />
            <span>Push</span>
          </Button>

          {/* New Branch */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenNewBranch}
            title="Create new branch"
            className="h-8 text-xs gap-1"
          >
            <Plus className="size-3.5" />
            <span>Branch</span>
          </Button>

          {/* Stash */}
          <div className="inline-flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenStashSave}
              title="Save uncommitted changes to stash"
              className="h-8 text-xs gap-1"
            >
              <Archive className="size-3.5" />
              <span>Stash</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStashPop}
              title="Quick Pop latest stash (stash@{0})"
              className="h-8 text-[11px] px-2 text-muted-foreground hover:text-foreground"
            >
              Pop
            </Button>
          </div>

          {/* Tag */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenNewTag}
            title="Create new tag"
            className="h-8 text-xs gap-1"
          >
            <TagIcon className="size-3.5" />
            <span>Tag</span>
          </Button>

          {/* Interactive Console */}
          <Button
            variant={isTerminalOpen ? 'secondary' : 'outline'}
            size="sm"
            onClick={onToggleTerminal}
            title="Open Interactive Git Console"
            className="h-8 text-xs gap-1 text-primary border-primary/30"
          >
            <Terminal className="size-3.5" />
            <span>Console</span>
          </Button>
        </div>
      </div>

      {statusMessage && (
        <div className="px-3 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in">
          {statusMessage}
        </div>
      )}

      {/* Main Studio View Mode Switcher */}
      <div className="flex items-center justify-between border-t pt-2 gap-2 overflow-x-auto">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelectView('changes')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'changes'
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <FolderGit2 className="size-3.5" />
            <span>Working Copy &amp; Staging</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeView === 'changes' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted'
              }`}
            >
              {changesCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectView('graph')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'graph'
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <GitCommitHorizontal className="size-3.5" />
            <span>Graph &amp; History</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectView('merge')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'merge'
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <GitMerge className="size-3.5" />
            <span>3-Way Merge</span>
            {conflictsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white font-mono text-[10px] font-bold">
                {conflictsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectView('editor')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'editor'
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Edit3 className="size-3.5" />
            <span>In-App Editor</span>
            <span className="text-[10px] opacity-75 font-mono">⌘P</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectView('tools')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'tools'
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Sparkles className="size-3.5" />
            <span>Git Studio Tools</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectView('github')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'github'
                ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <ShieldCheck className="size-3.5 text-emerald-500" />
            <span>GitHub &amp; CI</span>
          </button>
        </div>
      </div>
    </div>
  );
}
