import type { RepoGitStatus } from '@worklens/contracts';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderX,
  GitBranch,
  GitCommit,
  User,
} from 'lucide-react';
import { useSession } from '../../lib/session';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface MultiRepoCardProps {
  repo: RepoGitStatus;
}

export function MultiRepoCard({ repo }: MultiRepoCardProps) {
  const { open } = useSession();

  return (
    <div
      className={`rounded-xl border p-4 bg-card/60 transition-all hover:bg-card/90 ${
        !repo.exists
          ? 'border-rose-500/30'
          : repo.isDirty
            ? 'border-amber-500/30'
            : repo.behind > 0
              ? 'border-purple-500/30'
              : repo.ahead > 0
                ? 'border-sky-500/30'
                : 'border-border/80'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base text-foreground tracking-tight truncate">
              {repo.name}
            </span>
            {repo.exists ? (
              repo.isDirty ? (
                <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/10 gap-1 text-[11px]">
                  <AlertTriangle className="size-3" />
                  Modified
                </Badge>
              ) : (
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 gap-1 text-[11px]">
                  <CheckCircle2 className="size-3" />
                  Clean
                </Badge>
              )
            ) : (
              <Badge variant="outline" className="text-rose-500 border-rose-500/30 bg-rose-500/10 gap-1 text-[11px]">
                <FolderX className="size-3" />
                Missing
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate mt-0.5" title={repo.path}>
            {repo.path}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {repo.exists && (
            <Button
              variant="outline"
              size="xs"
              className="gap-1.5 text-xs font-medium"
              onClick={() => void open(repo.path)}
              title="Open and observe in Worklens"
            >
              <ExternalLink className="size-3" />
              Open in Worklens
            </Button>
          )}
        </div>
      </div>

      <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Branch & Sync Status */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <GitBranch className="size-3.5 shrink-0 text-foreground" />
            <span className="font-medium text-foreground">
              {repo.currentBranch ?? <span className="italic text-muted-foreground">No branch</span>}
            </span>
            {repo.trackingBranch && (
              <span className="text-[11px] text-muted-foreground font-mono">
                ({repo.trackingBranch})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {repo.ahead > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full font-medium bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <ArrowUp className="size-3" />
                {repo.ahead} ahead
              </span>
            )}
            {repo.behind > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full font-medium bg-purple-500/15 text-purple-600 dark:text-purple-400">
                <ArrowDown className="size-3" />
                {repo.behind} behind
              </span>
            )}
            {repo.exists && repo.ahead === 0 && repo.behind === 0 && repo.trackingBranch && (
              <span className="text-[11px] text-muted-foreground">Up to date with origin</span>
            )}
            {repo.isDirty && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {repo.stagedCount > 0 && <span className="text-emerald-500">+{repo.stagedCount} staged</span>}
                {repo.unstagedCount > 0 && <span className="text-amber-500">~{repo.unstagedCount} unstaged</span>}
                {repo.untrackedCount > 0 && <span className="text-sky-500">?{repo.untrackedCount} untracked</span>}
                {repo.conflictedCount > 0 && <span className="text-rose-500 font-bold">!{repo.conflictedCount} conflicts</span>}
              </div>
            )}
          </div>
        </div>

        {/* Last commit info */}
        <div className="space-y-1 sm:text-right">
          {repo.lastCommitSha ? (
            <>
              <div className="flex sm:justify-end items-center gap-1.5 text-muted-foreground">
                <GitCommit className="size-3.5 shrink-0" />
                <span className="font-mono text-[11px] font-semibold text-foreground">
                  {repo.lastCommitSha}
                </span>
                {repo.lastCommitAuthor && (
                  <span className="inline-flex items-center gap-0.5 text-[11px]">
                    <User className="size-3" />
                    {repo.lastCommitAuthor}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate" title={repo.lastCommitMessage ?? ''}>
                {repo.lastCommitMessage}
              </p>
              {repo.lastCommitTimestamp && (
                <div className="flex sm:justify-end items-center gap-1 text-[10px] text-muted-foreground/75">
                  <Clock className="size-2.5" />
                  <span>{new Date(repo.lastCommitTimestamp).toLocaleDateString()}</span>
                </div>
              )}
            </>
          ) : (
            <span className="text-muted-foreground italic text-[11px]">
              {repo.error ?? 'No commit history'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
