import type { Branch, Commit } from '@worklens/contracts';
import { Eye, EyeOff, Filter, GitBranch, Search, Star, User, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../ui/button';

export interface FilterState {
  search: string;
  author: string;
  file: string;
  soloBranch: string | null;
  hiddenBranches: Set<string>;
  hideRemotes: boolean;
}

interface Props {
  commits: Commit[];
  branches: Branch[];
  currentBranch: string | null;
  state: FilterState;
  onChange: (updater: (prev: FilterState) => FilterState) => void;
  filteredCount: number;
  totalCount: number;
}

export function GitFilters({
  commits,
  branches,
  currentBranch,
  state,
  onChange,
  filteredCount,
  totalCount,
}: Props) {
  const [showBranchManager, setShowBranchManager] = useState(false);

  // Unique authors for quick filter dropdown
  const authors = useMemo(() => {
    const set = new Set<string>();
    commits.forEach((c) => {
      if (c.author) set.add(c.author);
    });
    return Array.from(set).sort();
  }, [commits]);

  const hasActiveFilters =
    Boolean(state.search) ||
    Boolean(state.author) ||
    Boolean(state.file) ||
    Boolean(state.soloBranch) ||
    state.hiddenBranches.size > 0 ||
    state.hideRemotes;

  function clearAll() {
    onChange(() => ({
      search: '',
      author: '',
      file: '',
      soloBranch: null,
      hiddenBranches: new Set(),
      hideRemotes: false,
    }));
  }

  function toggleSolo(branchName: string) {
    onChange((prev) => ({
      ...prev,
      soloBranch: prev.soloBranch === branchName ? null : branchName,
    }));
  }

  function toggleHide(branchName: string) {
    onChange((prev) => {
      const next = new Set(prev.hiddenBranches);
      if (next.has(branchName)) {
        next.delete(branchName);
      } else {
        next.add(branchName);
      }
      return { ...prev, hiddenBranches: next };
    });
  }

  function toggleHideRemotes() {
    onChange((prev) => ({
      ...prev,
      hideRemotes: !prev.hideRemotes,
    }));
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 py-2 px-3 border-b bg-muted/20 text-xs">
      {/* Search Input */}
      <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search commits, SHA, author, branch, file…"
            value={state.search}
            onChange={(e) => onChange((prev) => ({ ...prev, search: e.target.value }))}
            className="w-full h-8 pl-8 pr-7 text-xs rounded-lg border bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
          {state.search && (
            <button
              type="button"
              onClick={() => onChange((prev) => ({ ...prev, search: '' }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Author Select */}
      <div className="flex items-center gap-1.5">
        <User className="size-3.5 text-muted-foreground" />
        <select
          value={state.author}
          onChange={(e) => onChange((prev) => ({ ...prev, author: e.target.value }))}
          className="h-8 text-xs rounded-lg border bg-background px-2 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
        >
          <option value="">All authors</option>
          {authors.map((author) => (
            <option key={author} value={author}>
              {author}
            </option>
          ))}
        </select>
      </div>

      {/* Touched File Filter */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          placeholder="Filter by touched file…"
          value={state.file}
          onChange={(e) => onChange((prev) => ({ ...prev, file: e.target.value }))}
          className="h-8 text-xs rounded-lg border bg-background px-2.5 w-36 text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
        {state.file && (
          <button
            type="button"
            onClick={() => onChange((prev) => ({ ...prev, file: '' }))}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Solo & Hide Branches Toggle & Manager */}
      <div className="relative flex items-center gap-1.5">
        <Button
          variant={
            state.soloBranch || state.hideRemotes || state.hiddenBranches.size > 0 ? 'secondary' : 'outline'
          }
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => setShowBranchManager(!showBranchManager)}
        >
          <GitBranch className="size-3.5" />
          <span>Branches</span>
          {state.soloBranch && (
            <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1 py-0.2 rounded text-[10px]">
              Solo
            </span>
          )}
          {state.hideRemotes && (
            <span className="bg-blue-500/20 text-blue-600 dark:text-blue-400 px-1 py-0.2 rounded text-[10px]">
              No remotes
            </span>
          )}
        </Button>

        {showBranchManager && (
          <div className="absolute right-0 top-9 z-50 w-72 rounded-xl border bg-card p-3 shadow-xl text-card-foreground">
            <div className="flex items-center justify-between pb-2 mb-2 border-b">
              <h4 className="text-xs font-semibold flex items-center gap-1.5">
                <Filter className="size-3.5 text-primary" />
                Branch Visibility & Solo
              </h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] px-1.5"
                onClick={() => setShowBranchManager(false)}
              >
                Done
              </Button>
            </div>

            <div className="flex items-center justify-between gap-1 mb-2.5">
              <Button
                variant={state.hideRemotes ? 'secondary' : 'outline'}
                size="sm"
                className="h-6 text-[10px] flex-1 px-1.5"
                onClick={toggleHideRemotes}
              >
                {state.hideRemotes ? <EyeOff className="size-3 mr-1" /> : <Eye className="size-3 mr-1" />}
                {state.hideRemotes ? 'Remotes Hidden' : 'Hide Remotes'}
              </Button>
              {currentBranch && (
                <Button
                  variant={state.soloBranch === currentBranch ? 'secondary' : 'outline'}
                  size="sm"
                  className="h-6 text-[10px] flex-1 px-1.5"
                  onClick={() => toggleSolo(currentBranch)}
                >
                  <Star className="size-3 mr-1 text-amber-500" />
                  Solo Current
                </Button>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1">
              {branches.map((b) => {
                const isSolo = state.soloBranch === b.name;
                const isHidden =
                  state.hiddenBranches.has(b.name) || (state.hideRemotes && b.name.includes('/'));
                return (
                  <div
                    key={b.name}
                    className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/50 text-xs"
                  >
                    <span className="truncate font-mono text-[11px]" title={b.name}>
                      {b.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant={isSolo ? 'default' : 'ghost'}
                        size="sm"
                        className={`h-5 text-[9px] px-1.5 ${isSolo ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                        onClick={() => toggleSolo(b.name)}
                      >
                        Solo
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => toggleHide(b.name)}
                        title={isHidden ? 'Show branch' : 'Hide branch'}
                      >
                        {isHidden ? (
                          <EyeOff className="size-3 text-red-500" />
                        ) : (
                          <Eye className="size-3 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Counts & Clear Filters */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">
          {filteredCount} / {totalCount} commits
        </span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-6 text-[10px] px-1.5 text-muted-foreground hover:text-foreground"
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
