import { useQuery } from '@tanstack/react-query';
import type { BatchReport, MultiRepoStatus, MultiRepoWorkspace } from '@worklens/contracts';
import {
  ArrowDownCircle,
  Download,
  FolderGit2,
  GitBranch,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { query } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { BatchReportDialog } from './batch-report-dialog';
import { MultiRepoCard } from './multi-repo-card';
import { type FilterTab, StatCards } from './stat-cards';

interface MultiRepoDashboardProps {
  workspace: MultiRepoWorkspace;
  onRefresh?: () => void;
}

export function MultiRepoDashboard({ workspace }: MultiRepoDashboardProps) {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [batchReport, setBatchReport] = useState<BatchReport | null>(null);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchActionRunning, setBatchActionRunning] = useState<string | null>(null);

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [targetBranch, setTargetBranch] = useState('');

  const statusQuery = useQuery({
    queryKey: ['multi_repo_status', workspace.id],
    queryFn: () => query<MultiRepoStatus>('multi_repo_status', null, { id: workspace.id }),
    refetchInterval: 20_000,
  });

  const status = statusQuery.data;

  async function runBatchAction(action: string, branch?: string) {
    setBatchActionRunning(action);
    try {
      const report = await query<BatchReport>('multi_repo_batch', null, {
        id: workspace.id,
        action,
        targetBranch: branch ?? null,
      });
      setBatchReport(report);
      setBatchDialogOpen(true);
      void statusQuery.refetch();
    } catch (err) {
      alert(`Batch action failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBatchActionRunning(null);
    }
  }

  const filteredRepos = useMemo(() => {
    if (!status?.repos) return [];
    return status.repos.filter((repo) => {
      const matchesSearch =
        search.trim() === '' ||
        repo.name.toLowerCase().includes(search.toLowerCase()) ||
        repo.path.toLowerCase().includes(search.toLowerCase()) ||
        (repo.currentBranch && repo.currentBranch.toLowerCase().includes(search.toLowerCase()));

      if (!matchesSearch) return false;

      switch (filter) {
        case 'dirty':
          return repo.isDirty;
        case 'ahead_behind':
          return repo.ahead > 0 || repo.behind > 0;
        case 'missing':
          return !repo.exists;
        case 'clean':
          return repo.exists && !repo.isDirty && repo.ahead === 0 && repo.behind === 0;
        default:
          return true;
      }
    });
  }, [status?.repos, search, filter]);

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <StatCards
        status={status}
        fallbackTotal={workspace.repos.length}
        filter={filter}
        onFilterChange={setFilter}
      />

      {/* Batch Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border bg-muted/20">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs font-medium"
            disabled={batchActionRunning !== null}
            onClick={() => void runBatchAction('fetch')}
          >
            <Download className="size-3.5" />
            {batchActionRunning === 'fetch' ? 'Fetching…' : 'Fetch All'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs font-medium"
            disabled={batchActionRunning !== null}
            onClick={() => void runBatchAction('pull')}
          >
            <ArrowDownCircle className="size-3.5" />
            {batchActionRunning === 'pull' ? 'Pulling…' : 'Pull All'}
          </Button>

          {Boolean(status && status.missingRepos > 0) && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs font-medium text-rose-500 border-rose-500/30 hover:bg-rose-500/10"
              disabled={batchActionRunning !== null}
              onClick={() => void runBatchAction('clone')}
            >
              <FolderGit2 className="size-3.5" />
              {batchActionRunning === 'clone' ? 'Cloning…' : `Clone Missing (${status?.missingRepos})`}
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setCheckoutModalOpen(true)}
            disabled={batchActionRunning !== null}
          >
            <GitBranch className="size-3.5" />
            Checkout Branch…
          </Button>
        </div>

        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => void statusQuery.refetch()}
          title="Refresh Git status"
        >
          <RefreshCw className={`size-3.5 ${statusQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter by name, path or branch…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {(['all', 'dirty', 'ahead_behind', 'missing', 'clean'] as FilterTab[]).map((tab) => (
            <Badge
              key={tab}
              variant={filter === tab ? 'default' : 'outline'}
              className="cursor-pointer capitalize text-[11px] px-2.5 py-1"
              onClick={() => setFilter(tab)}
            >
              {tab.replace('_', ' / ')}
            </Badge>
          ))}
        </div>
      </div>

      {/* Repository Cards Grid */}
      <div className="space-y-3">
        {filteredRepos.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
            No repositories match the current filters.
          </div>
        ) : (
          filteredRepos.map((repo) => <MultiRepoCard key={repo.repoId} repo={repo} />)
        )}
      </div>

      {/* Batch Checkout Branch Dialog */}
      <Dialog open={checkoutModalOpen} onOpenChange={setCheckoutModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Batch Checkout Branch</DialogTitle>
            <DialogDescription>
              Switch the active branch across all repositories in this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <label htmlFor="target-branch" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Branch Name
            </label>
            <Input
              id="target-branch"
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
              placeholder="e.g. main, develop, feature/v2"
              className="mt-1.5"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCheckoutModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!targetBranch.trim()}
              onClick={() => {
                setCheckoutModalOpen(false);
                void runBatchAction('checkout', targetBranch.trim());
              }}
            >
              Checkout Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Report Log Dialog */}
      <BatchReportDialog
        report={batchReport}
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
      />
    </div>
  );
}
