import { useQuery } from '@tanstack/react-query';
import type { FileChange, GitSnapshot } from '@worklens/contracts';
import { CircleAlert, GitBranch, GitCommitHorizontal, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Empty, ErrorNotice, Loading, Source } from '../components/common';
import { type DiffSelection, GitDiff } from '../components/git-diff';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ViewHeading } from '../components/view-heading';
import { query } from '../lib/api';
import { isConflict, isStaged, isUnstaged } from '../lib/git-status';
import { useGit, useSession } from '../lib/session';

export function GitPage() {
  const { repo, open } = useSession();
  const git = useGit();
  const [tab, setTab] = useState('changes');
  const [selection, setSelection] = useState<DiffSelection | null>(null);
  const [offset, setOffset] = useState(0);
  const history = useQuery({
    queryKey: ['history', repo?.path, offset],
    queryFn: () => query<GitSnapshot>('git', repo?.path, { offset }),
    enabled: Boolean(repo) && tab === 'history',
  });
  const changes = git.data?.changes ?? [];
  const conflicts = changes.filter(isConflict);
  const active = git.data?.branches.find((branch) => branch.name === git.data?.branch);
  const fileSelection =
    selection?.path && !changes.some((change) => change.path === selection.path) ? null : selection;
  function selectFile(change: FileChange, staged: boolean) {
    setSelection({ path: change.path, staged, untracked: change.indexStatus === '?' });
  }
  return (
    <>
      <ViewHeading
        section="Git"
        title="Your working tree"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <GitBranch className="size-3.5" />
            {git.data?.branch ?? 'Detached HEAD'}
            <span className="text-border">/</span>
            {active?.upstream ?? 'No upstream'} {active?.tracking}
          </span>
        }
      >
        <Button variant="outline" size="sm" onClick={() => void git.refetch()} disabled={git.isFetching}>
          <RefreshCw className={`size-3.5 ${git.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </ViewHeading>
      <ErrorNotice error={git.error} />
      {git.isPending && <Loading />}
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value);
          setSelection(null);
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <TabsList aria-label="Git views">
            <TabsTrigger value="changes">
              Changes <span className="tab-count">{changes.length}</span>
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="worktrees">Worktrees</TabsTrigger>
          </TabsList>
          <span title="Remote Git operations are not available in this version">
            <Button size="sm" variant="outline" disabled>
              Sync
            </Button>
          </span>
        </div>
        <TabsContent value="changes">
          {conflicts.length > 0 && (
            <div className="conflict-banner" role="status">
              <CircleAlert className="size-4 shrink-0" />
              <div>
                <strong>
                  {conflicts.length} unresolved conflict{conflicts.length > 1 ? 's' : ''}
                </strong>
                <p className="mt-1 text-xs">Resolve these files in your editor before committing.</p>
              </div>
            </div>
          )}
          <div className="git-workspace">
            <section className="git-files" aria-label="Changed files">
              <div className="file-groups">
                {[
                  { label: 'Conflicts', files: conflicts, staged: false },
                  { label: 'Changes', files: changes.filter(isUnstaged), staged: false },
                  { label: 'Staged', files: changes.filter(isStaged), staged: true },
                ].map(
                  (group) =>
                    group.files.length > 0 && (
                      <div key={group.label} className="file-group">
                        <h2>
                          {group.label}
                          <span>{group.files.length}</span>
                        </h2>
                        {group.files.map((change) => (
                          <button
                            type="button"
                            key={change.path}
                            className={`file-row ${fileSelection?.path === change.path && Boolean(fileSelection.staged) === group.staged ? 'selected' : ''}`}
                            onClick={() => selectFile(change, group.staged)}
                            aria-pressed={
                              fileSelection?.path === change.path &&
                              Boolean(fileSelection.staged) === group.staged
                            }
                          >
                            <span className={`file-status ${isConflict(change) ? 'conflicted' : ''}`}>
                              {isConflict(change)
                                ? 'U'
                                : group.staged
                                  ? change.indexStatus
                                  : change.worktreeStatus}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs">{change.path.split('/').pop()}</span>
                              <span
                                className="mt-1 block truncate text-[10px] text-muted-foreground"
                                title={change.path}
                              >
                                {change.path}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ),
                )}
                {git.data && changes.length === 0 && (
                  <div className="p-5 text-sm text-muted-foreground">Your working tree is clean.</div>
                )}
              </div>
              <div className="commit-composer">
                <textarea aria-label="Commit message" placeholder="Commit message…" disabled rows={2} />
                <Button disabled className="w-full" size="sm">
                  Commit
                </Button>
                <p>Read-only Git · Stage and commit in your editor.</p>
              </div>
            </section>
            <GitDiff selection={fileSelection} />
          </div>
        </TabsContent>
        <TabsContent value="history">
          <ErrorNotice error={history.error} />
          {history.isPending && <Loading />}
          <div className="git-workspace">
            <section className="history-list" aria-label="Commit history">
              {history.data?.commits.map((commit) => (
                <button
                  key={commit.sha}
                  type="button"
                  onClick={() => setSelection({ base: commit.parents[0], head: commit.sha })}
                  className={`history-row ${selection?.head === commit.sha ? 'selected' : ''}`}
                >
                  <GitCommitHorizontal className="mt-1 size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{commit.subject}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {commit.author} · {commit.sha.slice(0, 7)}
                    </p>
                    <time className="text-[10px] text-muted-foreground">
                      {new Date(commit.date).toLocaleString()}
                    </time>
                  </div>
                </button>
              ))}
              {history.data?.commits.length === 0 && (
                <p className="p-5 text-sm text-muted-foreground">No commits yet.</p>
              )}
              <div className="flex justify-between gap-2 border-t p-3">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 50))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={history.data?.nextOffset == null}
                  onClick={() => setOffset(history.data?.nextOffset ?? 0)}
                >
                  Next 50
                </Button>
              </div>
            </section>
            <GitDiff selection={selection} />
          </div>
        </TabsContent>
        <TabsContent value="branches">
          <div className="divide-y rounded-xl border">
            {git.data?.branches.map((branch) => (
              <div key={branch.name} className="flex items-center gap-3 p-4 text-sm">
                <GitBranch className="size-4 text-muted-foreground" />
                <span className="flex-1">{branch.name}</span>
                <span className="text-xs text-muted-foreground">
                  {branch.upstream ?? 'No upstream'} {branch.tracking}
                </span>
              </div>
            ))}
          </div>
          {git.data?.branches.length === 0 && (
            <Empty title="No branches yet">Create your first commit in Git.</Empty>
          )}
        </TabsContent>
        <TabsContent value="worktrees">
          <div className="divide-y rounded-xl border">
            {git.data?.worktrees.map((tree) => (
              <div key={tree.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{tree.branch ?? 'Detached HEAD'}</p>
                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{tree.path}</p>
                  {(tree.locked || tree.prunable) && (
                    <p className="mt-1 text-xs text-amber-700">{tree.locked ? 'Locked' : 'Prunable'}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={tree.prunable || tree.path === repo?.path}
                  onClick={() => void open(tree.path)}
                >
                  {tree.path === repo?.path ? 'Current' : 'Inspect'}
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {git.data && (
        <footer className="mt-5">
          <Source source={git.data.provenance} />
          <p className="mt-2 text-[10px] text-muted-foreground">
            Remote references are last known. No fetch is performed.
          </p>
        </footer>
      )}
    </>
  );
}
