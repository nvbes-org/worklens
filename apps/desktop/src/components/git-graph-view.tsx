import { useQuery } from '@tanstack/react-query';
import type { Commit, GitSnapshot } from '@worklens/contracts';
import { useState } from 'react';
import { query } from '../lib/api';
import { useGit, useSession } from '../lib/session';
import { type DiffSelection, GitDiff } from './git-diff';
import { CommitDetailsPanel } from './git-graph/commit-details-panel';
import { type FilterState, GitFilters } from './git-graph/git-filters';
import { GitGraph } from './git-graph/git-graph';

export function GitGraphView() {
  const { repo } = useSession();
  const git = useGit();
  const [offset, setOffset] = useState(0);

  const history = useQuery({
    queryKey: ['history', repo?.path, offset],
    queryFn: () => query<GitSnapshot>('git', repo?.path, { offset }),
    enabled: Boolean(repo),
  });

  const commits = history.data?.commits ?? git.data?.commits ?? [];
  const branches = git.data?.branches ?? [];
  const tags = git.data?.tags ?? [];
  const headSha = git.data?.head ?? null;
  const currentBranch = git.data?.branch ?? null;

  const [filterState, setFilterState] = useState<FilterState>({
    search: '',
    author: '',
    file: '',
    soloBranch: null,
    hiddenBranches: new Set(),
    hideRemotes: false,
  });

  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [diffSelection, setDiffSelection] = useState<DiffSelection | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Compute reachable commits for solo branch
  const soloShas = (() => {
    if (!filterState.soloBranch) return null;
    const target = branches.find((b) => b.name === filterState.soloBranch);
    if (!target) return null;
    const commitMap = new Map<string, Commit>();
    for (const c of commits) {
      commitMap.set(c.sha, c);
    }
    const reachable = new Set<string>();
    const queue = [target.head];
    while (queue.length > 0) {
      const sha = queue.shift();
      if (!sha || reachable.has(sha)) continue;
      reachable.add(sha);
      const c = commitMap.get(sha);
      if (c) {
        for (const p of c.parents) {
          if (!reachable.has(p)) queue.push(p);
        }
      }
    }
    return reachable;
  })();

  // Filter branches based on hidden / remotes
  const visibleBranches = branches.filter((b) => {
    if (filterState.hiddenBranches.has(b.name)) return false;
    if (filterState.hideRemotes && b.name.includes('/')) return false;
    return true;
  });

  // Filter commits
  const filteredCommits = commits.filter((c) => {
    if (soloShas && !soloShas.has(c.sha)) return false;

    if (filterState.author && c.author !== filterState.author) return false;

    if (filterState.search) {
      const q = filterState.search.toLowerCase();
      const matchSubject = c.subject.toLowerCase().includes(q);
      const matchBody = c.body.toLowerCase().includes(q);
      const matchAuthor = c.author.toLowerCase().includes(q);
      const matchEmail = c.authorEmail.toLowerCase().includes(q);
      const matchSha = c.sha.toLowerCase().startsWith(q);
      const matchBranch = visibleBranches.some((b) => b.head === c.sha && b.name.toLowerCase().includes(q));
      if (!matchSubject && !matchBody && !matchAuthor && !matchEmail && !matchSha && !matchBranch) {
        return false;
      }
    }

    if (filterState.file) {
      const f = filterState.file.toLowerCase();
      const matchSubject = c.subject.toLowerCase().includes(f);
      const matchBody = c.body.toLowerCase().includes(f);
      if (!matchSubject && !matchBody) return false;
    }

    return true;
  });

  function handleSelectCommit(commit: Commit) {
    setSelectedCommit(commit);
    setDiffSelection({ head: commit.sha, base: commit.parents[0] });
  }

  function handleSelectFile(path: string) {
    if (selectedCommit) {
      setDiffSelection({
        path,
        head: selectedCommit.sha,
        base: selectedCommit.parents[0],
      });
    }
  }

  function handleSelectSha(sha: string) {
    const found = commits.find((c) => c.sha === sha);
    if (found) handleSelectCommit(found);
  }

  function notifySuccess(msg: string) {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4000);
  }

  return (
    <div className="flex flex-col flex-1 min-h-[540px] border rounded-xl overflow-hidden bg-background">
      {actionSuccess && (
        <div className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20 px-4 py-2 text-xs font-medium animate-in fade-in flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button type="button" onClick={() => setActionSuccess(null)} className="text-xs hover:opacity-75">
            ✕
          </button>
        </div>
      )}

      {/* Filter and Branch Solo/Hide Bar */}
      <GitFilters
        commits={commits}
        branches={branches}
        currentBranch={currentBranch}
        state={filterState}
        onChange={setFilterState}
        filteredCount={filteredCommits.length}
        totalCount={commits.length}
      />

      {/* Main View: Git Graph + Details Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Commit Graph */}
        <div className="flex-1 flex flex-col min-w-0">
          <GitGraph
            commits={filteredCommits}
            headSha={headSha}
            currentBranch={currentBranch}
            branches={visibleBranches}
            tags={tags}
            selectedSha={selectedCommit?.sha ?? null}
            onSelectCommit={handleSelectCommit}
            onActionSuccess={notifySuccess}
          />
          <div className="flex items-center justify-between border-t px-3 py-1.5 bg-muted/20 text-xs text-muted-foreground">
            <span>
              Offset: {offset} {history.data?.nextOffset ? `· Next: ${history.data.nextOffset}` : ''}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 50))}
                className="px-2 py-0.5 rounded border bg-background hover:bg-muted disabled:opacity-40 text-[11px]"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={history.data?.nextOffset == null}
                onClick={() => setOffset(history.data?.nextOffset ?? 0)}
                className="px-2 py-0.5 rounded border bg-background hover:bg-muted disabled:opacity-40 text-[11px]"
              >
                Next 50
              </button>
            </div>
          </div>
        </div>

        {/* Right: Commit Details & Diff Panel */}
        {selectedCommit && (
          <div className="w-[420px] shrink-0 border-l flex flex-col bg-card/60 backdrop-blur-xs">
            <CommitDetailsPanel
              commit={selectedCommit}
              onClose={() => {
                setSelectedCommit(null);
                setDiffSelection(null);
              }}
              onSelectFile={handleSelectFile}
              onSelectSha={handleSelectSha}
            />
            {diffSelection && (
              <div className="h-64 border-t flex flex-col">
                <GitDiff selection={diffSelection} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
