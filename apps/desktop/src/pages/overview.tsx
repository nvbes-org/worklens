import { Link } from '@tanstack/react-router';
import { ArrowRight, Box, Check, CircleAlert, FileCode2, GitBranch, GitCommitHorizontal } from 'lucide-react';
import { Empty, ErrorNotice, Loading, Source } from '../components/common';
import { Badge } from '../components/ui/badge';
import { ViewHeading } from '../components/view-heading';
import { isConflict } from '../lib/git-status';
import { useGit, useGraph, useSession } from '../lib/session';

export function Overview() {
  const { repo } = useSession();
  const git = useGit();
  const graph = useGraph();
  const projects = graph.data?.nodes.filter((node) => !node.external) ?? [];
  const conflicts = git.data?.changes.filter(isConflict) ?? [];
  const changes = git.data?.changes.length ?? 0;
  return (
    <>
      <ViewHeading
        section="Overview"
        title={repo?.name ?? 'Your project'}
        description={<span className="font-mono text-xs">{repo?.path}</span>}
      >
        <Badge variant="outline" className="gap-2 py-1.5">
          <GitBranch className="size-3.5" />
          {git.data?.branch ?? 'Detached HEAD'}
        </Badge>
      </ViewHeading>
      <ErrorNotice error={git.error || graph.error} />
      {git.isPending && <Loading />}
      <section className="overview-section">
        <h2 className="section-heading">Needs attention</h2>
        <div className="attention-list">
          {conflicts.length > 0 && (
            <Link to="/$view" params={{ view: 'git' }} className="attention-row">
              <span className="attention-icon bg-amber-50 text-amber-700">
                <CircleAlert className="size-[18px]" />
              </span>
              <div className="flex-1">
                <p className="font-medium">
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
              <span className="attention-icon bg-blue-50 text-primary">
                {changes ? <FileCode2 className="size-[18px]" /> : <Check className="size-[18px]" />}
              </span>
              <div className="flex-1">
                <p className="font-medium">
                  {changes
                    ? `${changes} changed file${changes > 1 ? 's' : ''}`
                    : 'Your working tree is clean'}
                </p>
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
          <div className="overflow-x-auto rounded-xl border">
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
                        className="flex items-center gap-3 font-medium"
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
                      {graph.data?.edges.filter((edge) => edge.source === node.id && edge.kind !== 'contains')
                        .length ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {projects.length > 6 && (
              <Link
                to="/$view"
                params={{ view: 'architecture' }}
                className="block border-t p-3 text-center text-xs text-primary"
              >
                View all {projects.length} components
              </Link>
            )}
          </div>
        )}
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
          <div className="divide-y">
            {git.data?.commits.slice(0, 3).map((commit) => (
              <div key={commit.sha} className="activity-row">
                <GitCommitHorizontal className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{commit.subject}</p>
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
      {git.data && (
        <footer className="mt-6">
          <Source source={git.data.provenance} />
        </footer>
      )}
    </>
  );
}
