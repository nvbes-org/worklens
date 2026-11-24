import type { MultiRepoStatus } from '@worklens/contracts';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FolderGit2,
  FolderX,
} from 'lucide-react';

export type FilterTab = 'all' | 'dirty' | 'ahead_behind' | 'missing' | 'clean';

interface StatCardsProps {
  status: MultiRepoStatus | undefined;
  fallbackTotal: number;
  filter: FilterTab;
  onFilterChange: (tab: FilterTab) => void;
}

export function StatCards({ status, fallbackTotal, filter, onFilterChange }: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <div
        onClick={() => onFilterChange('all')}
        className={`cursor-pointer rounded-xl border p-3 bg-card/40 transition-all hover:bg-muted/50 ${
          filter === 'all' ? 'border-primary ring-1 ring-primary/40' : 'border-border/60'
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs font-medium">Total</span>
          <FolderGit2 className="size-3.5" />
        </div>
        <span className="text-2xl font-bold text-foreground">{status?.totalRepos ?? fallbackTotal}</span>
      </div>

      <div
        onClick={() => onFilterChange('clean')}
        className={`cursor-pointer rounded-xl border p-3 bg-card/40 transition-all hover:bg-muted/50 ${
          filter === 'clean' ? 'border-emerald-500 ring-1 ring-emerald-500/40' : 'border-border/60'
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs font-medium">Clean</span>
          <CheckCircle2 className="size-3.5 text-emerald-500" />
        </div>
        <span className="text-2xl font-bold text-emerald-500">{status?.cleanRepos ?? 0}</span>
      </div>

      <div
        onClick={() => onFilterChange('dirty')}
        className={`cursor-pointer rounded-xl border p-3 bg-card/40 transition-all hover:bg-muted/50 ${
          filter === 'dirty' ? 'border-amber-500 ring-1 ring-amber-500/40' : 'border-border/60'
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs font-medium">Modified</span>
          <AlertTriangle className="size-3.5 text-amber-500" />
        </div>
        <span className="text-2xl font-bold text-amber-500">{status?.dirtyRepos ?? 0}</span>
      </div>

      <div
        onClick={() => onFilterChange('ahead_behind')}
        className={`cursor-pointer rounded-xl border p-3 bg-card/40 transition-all hover:bg-muted/50 ${
          filter === 'ahead_behind' ? 'border-sky-500 ring-1 ring-sky-500/40' : 'border-border/60'
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs font-medium">Ahead</span>
          <ArrowUp className="size-3.5 text-sky-500" />
        </div>
        <span className="text-2xl font-bold text-sky-500">{status?.aheadRepos ?? 0}</span>
      </div>

      <div
        onClick={() => onFilterChange('ahead_behind')}
        className={`cursor-pointer rounded-xl border p-3 bg-card/40 transition-all hover:bg-muted/50 ${
          filter === 'ahead_behind' ? 'border-purple-500 ring-1 ring-purple-500/40' : 'border-border/60'
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs font-medium">Behind</span>
          <ArrowDown className="size-3.5 text-purple-500" />
        </div>
        <span className="text-2xl font-bold text-purple-500">{status?.behindRepos ?? 0}</span>
      </div>

      <div
        onClick={() => onFilterChange('missing')}
        className={`cursor-pointer rounded-xl border p-3 bg-card/40 transition-all hover:bg-muted/50 ${
          filter === 'missing' ? 'border-rose-500 ring-1 ring-rose-500/40' : 'border-border/60'
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground mb-1">
          <span className="text-xs font-medium">Missing</span>
          <FolderX className="size-3.5 text-rose-500" />
        </div>
        <span className="text-2xl font-bold text-rose-500">{status?.missingRepos ?? 0}</span>
      </div>
    </div>
  );
}
