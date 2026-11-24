import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { DiffResult, FolderSizeReport } from '@worklens/contracts';
import {
  ArrowRight,
  Box,
  Check,
  CircleAlert,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  HardDrive,
} from 'lucide-react';
import { useState } from 'react';
import { Empty, ErrorNotice, Loading, Source } from '../components/common';
import { FolderSizesDialog, formatBytes } from '../components/folder-sizes';
import { Badge } from '../components/ui/badge';
import { ViewHeading } from '../components/view-heading';
import { query } from '../lib/api';
import { diffStats, isConflict } from '../lib/git-status';
import { useGit, useGraph, useSession } from '../lib/session';

export function Overview() {
  const { repo } = useSession();
  const git = useGit();
  const graph = useGraph();
  const projects = graph.data?.nodes.filter((node) => !node.external) ?? [];
  const conflicts = git.data?.changes.filter(isConflict) ?? [];
  const changes = git.data?.changes.length ?? 0;

  const [folderSizesOpen, setFolderSizesOpen] = useState(false);
  const diff = useQuery({
    queryKey: ['diff', repo?.path, 'summary', git.data?.head],
    queryFn: () => query<DiffResult>('diff', repo?.path, git.data?.head ? { base: 'HEAD' } : {}),
    enabled: Boolean(repo?.path && changes > 0),
  });
  const folderSizes = useQuery({
    queryKey: ['folder_sizes', repo?.path, 'summary'],
    queryFn: () => query<FolderSizeReport>('folder_sizes', repo?.path, { maxDepth: 2, includeHidden: true }),
    enabled: Boolean(repo?.path),
    staleTime: 60_000,
  });
  const stats = diff.data?.text ? diffStats(diff.data.text) : null;

  return (
    <>
      <ViewHeading
        section="Overview"
        title={repo?.name ?? 'Your project'}
        description={<span className="font-mono text-xs">{repo?.path}</span>}
      >
        <div className="flex items-center gap-2">
          {stats && (stats.additions > 0 || stats.deletions > 0) && (
            <span
              className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-2.5 py-1 font-mono text-xs font-semibold shadow-2xs"
              title={`${stats.additions} insertions, ${stats.deletions} deletions`}
            >
              <span className="text-emerald-600 dark:text-emerald-400">+{stats.additions}</span>
              <span className="text-rose-600 dark:text-rose-400">−{stats.deletions}</span>
            </span>
          )}
          <Badge variant="outline" className="gap-2 py-1.5">
            <GitBranch className="size-3.5" />
            {git.data?.branch ?? 'Detached HEAD'}
          </Badge>
        </div>
      </ViewHeading>
      <ErrorNotice error={git.error || graph.error} />
      {git.isPending && <Loading />}
      <div className="overview-grid">
        <div className="overview-col-main">
          <section className="overview-section">
            <div className="section-heading">
              <h2>Apps & packages</h2>
              <Link to="/$view" params={{ view: 'architecture' }} className="section-link">
                Explore architecture
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {graph.isPending ? (
              <Loading />
            ) : projects.length === 0 ? (
              <Empty title="No components discovered">
                Projects and crates appear after inspecting a repository.
              </Empty>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card/40">
                <table className="project-table">
                  <thead>
                    <tr>
                      <th>Component</th>
                      <th>Location</th>
                      <th>Type</th>
                      <th>Dependencies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.slice(0, 6).map((node) => (
                      <tr key={node.id}>
                        <td>
                          <Link
                            to="/$view"
                            params={{ view: 'architecture' }}
                            className="flex items-center gap-3 font-medium text-foreground hover:text-primary"
                          >
                            <Box className="size-4 text-muted-foreground" />
                            {node.name}
                          </Link>
                        </td>
                        <td className="font-mono text-xs text-muted-foreground">{node.root || '.'}</td>
                        <td>
                          <Badge variant="secondary">
                            {node.ecosystem} · {node.kind}
                          </Badge>
                        </td>
                        <td className="text-muted-foreground">
                          {graph.data?.edges.filter(
                            (edge) => edge.source === node.id && edge.kind !== 'contains',
                          ).length ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {projects.length > 6 && (
                  <Link
                    to="/$view"
                    params={{ view: 'architecture' }}
                    className="block border-t border-border p-3 text-center text-xs text-primary hover:bg-accent/50"
                  >
                    View all {projects.length} components
                  </Link>
                )}
              </div>
            )}
          </section>
        </div>
        <div className="overview-col-side">
          <section className="overview-section">
            <h2 className="section-heading">Needs attention</h2>
            <div className="attention-list">
              {conflicts.length > 0 && (
                <Link to="/$view" params={{ view: 'git' }} className="attention-row">
                  <span className="attention-icon bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                    <CircleAlert className="size-[18px]" />
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {conflicts.length} unresolved conflict{conflicts.length > 1 ? 's' : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Review the files before your next commit.
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              )}
              {git.data && (
                <Link to="/$view" params={{ view: 'git' }} className="attention-row">
                  <span className="attention-icon bg-blue-50 text-primary dark:bg-blue-950/60 dark:text-blue-400">
                    {changes ? <FileCode2 className="size-[18px]" /> : <Check className="size-[18px]" />}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">
                        {changes
                          ? `${changes} changed file${changes > 1 ? 's' : ''}`
                          : 'Your working tree is clean'}
                      </p>
                      {stats && (stats.additions > 0 || stats.deletions > 0) && (
                        <span className="font-mono text-xs font-semibold">
                          <span className="text-emerald-600 dark:text-emerald-400">+{stats.additions}</span>{' '}
                          <span className="text-rose-600 dark:text-rose-400">−{stats.deletions}</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {changes
                        ? 'Review changes in your active worktree.'
                        : 'Explore the history or continue in your editor.'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">Open Git</span>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </Link>
              )}
            </div>
          </section>
          <section className="overview-section">
            <div className="section-heading">
              <h2>Recent activity</h2>
              <Link to="/$view" params={{ view: 'git' }} className="section-link">
                View Git
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {git.data?.commits.length === 0 ? (
              <Empty title="No commits yet">The repository history will appear here.</Empty>
            ) : (
              <div className="divide-y divide-border">
                {git.data?.commits.slice(0, 3).map((commit) => (
                  <div key={commit.sha} className="activity-row">
                    <GitCommitHorizontal className="size-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{commit.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {commit.author} · <span className="font-mono">{commit.sha.slice(0, 7)}</span>
                      </p>
                    </div>
                    <time className="text-xs text-muted-foreground" dateTime={commit.date}>
                      {new Date(commit.date).toLocaleDateString()}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="overview-section">
            <div className="section-heading">
              <h2>Storage & disk usage</h2>
              <button
                type="button"
                onClick={() => setFolderSizesOpen(true)}
                className="section-link bg-transparent border-0 cursor-pointer p-0"
              >
                Inspect sizes
                <ArrowRight className="size-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setFolderSizesOpen(true)}
              className="attention-row cursor-pointer text-left w-full border-0 bg-transparent p-0"
            >
              <span className="attention-icon bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                <HardDrive className="size-[18px]" />
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">
                    {folderSizes.data ? formatBytes(folderSizes.data.total_bytes) : 'Calculating...'}
                  </p>
                  {folderSizes.data && (
                    <Badge
                      variant="outline"
                      className="font-mono text-[11px] py-0 text-emerald-600 dark:text-emerald-400"
                    >
                      ⚡ {Number(folderSizes.data.duration_ms)}ms
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {folderSizes.data
                    ? `${Number(folderSizes.data.total_files).toLocaleString()} files across ${Number(folderSizes.data.total_dirs).toLocaleString()} folders.`
                    : 'Scanning repository filesystem...'}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">Details</span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </button>
          </section>
        </div>
      </div>
      <FolderSizesDialog open={folderSizesOpen} onOpenChange={setFolderSizesOpen} />
      {git.data && (
        <footer className="mt-8 border-t pt-4">
          <Source source={git.data.provenance} />
        </footer>
      )}
    </>
  );
}
