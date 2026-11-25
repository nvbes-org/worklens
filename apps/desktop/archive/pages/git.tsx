import { useQuery } from '@tanstack/react-query';
import type { DiffResult, GitSnapshot } from '@worklens/contracts';
import { GitBranch, GitCommitHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty, ErrorNotice, Loading, PageTitle, Source } from '../components/common';
import { RelationGraph } from '../components/relation-graph';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { WorkEntry } from '../components/work-entry';
import { query } from '../lib/api';
import { useGit, useSession } from '../lib/session';

export function GitPage() {
  const { repo, open } = useSession();
  const git = useGit();
  const [selection, setSelection] = useState<{
    path?: string;
    base?: string;
    head?: string;
    staged?: boolean;
  } | null>(null);
  const [offset, setOffset] = useState(0);
  const history = useQuery({
    queryKey: ['history', repo?.path, offset],
    queryFn: () => query<GitSnapshot>('git', repo?.path, { offset }),
    enabled: Boolean(repo),
  });
  const diff = useQuery({
    queryKey: ['diff', repo?.path, selection],
    queryFn: () => query<DiffResult>('diff', repo?.path, selection ?? {}),
    enabled: Boolean(selection && repo),
  });
  const commitGraph = useMemo(() => {
    const commits = history.data?.commits ?? [];
    const visible = new Set(commits.map((commit) => commit.sha));
    return {
      nodes: commits.map((commit) => ({
        id: commit.sha,
        label: `${commit.sha.slice(0, 8)} · ${commit.subject}`,
      })),
      edges: commits.flatMap((commit) =>
        commit.parents
          .filter((parent) => visible.has(parent))
          .map((parent) => ({ id: `${commit.sha}:${parent}`, source: commit.sha, target: parent })),
      ),
    };
  }, [history.data]);
  return (
    <>
      <PageTitle
        title="Git & worktrees"
        description="Local changes and history. Remote references are shown as last known; no fetch is performed."
      />
      <ErrorNotice error={git.error} />
      {git.isPending && <Loading />}
      <div className="mb-6 flex items-center gap-3 text-sm">
        <GitBranch className="size-4" />
        {git.data?.branch ?? 'Detached HEAD'}
        <Badge variant="outline">{git.data?.head?.slice(0, 8) ?? 'No commits'}</Badge>
        <span className="text-muted-foreground">{git.data?.changes.length ?? 0} changed files</span>
      </div>
      <Tabs defaultValue="changes">
        <TabsList>
          <TabsTrigger value="changes">Changes</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="worktrees">Worktrees</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
        </TabsList>
        <TabsContent value="changes" className="mt-5">
          <div className="divide-y rounded-xl border bg-white">
            {git.data?.changes.map((change) => (
              <div key={change.path} className="flex items-center gap-3 p-3 text-sm">
                <Badge variant="outline" className="font-mono">
                  {change.indexStatus}
                  {change.worktreeStatus}
                </Badge>
                <span className="flex-1 font-mono text-xs">
                  {change.path}
                  {change.previousPath && ` ← ${change.previousPath}`}
                </span>
                {change.indexStatus !== ' ' && change.indexStatus !== '?' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelection({ path: change.path, staged: true })}
                  >
                    Staged diff
                  </Button>
                )}
                {change.indexStatus === '?' ? (
                  <span className="text-xs text-muted-foreground">Untracked — no Git diff</span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setSelection({ path: change.path })}>
                    Working diff
                  </Button>
                )}
              </div>
            ))}
          </div>
          {git.data?.changes.length === 0 && (
            <Empty title="Working tree is clean">There are no local changes in this worktree.</Empty>
          )}
        </TabsContent>
        <TabsContent value="history" className="mt-5">
          <ErrorNotice error={history.error} />
          <details className="mb-5">
            <summary className="mb-3 cursor-pointer text-sm">
              Commit graph — current page, child → parent
            </summary>
            <RelationGraph
              {...commitGraph}
              onSelect={(sha) =>
                setSelection({
                  head: sha,
                  base: history.data?.commits.find((c) => c.sha === sha)?.parents[0],
                })
              }
            />
          </details>
          <div className="divide-y rounded-xl border bg-white">
            {history.data?.commits.map((commit) => (
              <button
                key={commit.sha}
                type="button"
                className="flex w-full items-start gap-4 p-4 text-left hover:bg-muted/40"
                onClick={() => setSelection({ base: commit.parents[0], head: commit.sha })}
              >
                <GitCommitHorizontal className="mt-1 size-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{commit.subject}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {commit.author} · {new Date(commit.date).toLocaleString()}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {commit.sha.slice(0, 8)} ← {commit.parents.map((p) => p.slice(0, 8)).join(', ') || 'root'}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={!history.data?.nextOffset}
              onClick={() => setOffset(history.data?.nextOffset ?? 0)}
            >
              Next 50
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="worktrees" className="mt-5">
          <div className="divide-y rounded-xl border bg-white">
            {git.data?.worktrees.map((tree) => (
              <div key={tree.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">{tree.branch ?? 'Detached HEAD'}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">{tree.path}</p>
                  <WorkEntry
                    title={tree.branch ?? 'Detached worktree'}
                    source={{
                      kind: 'worktree',
                      reference: tree.path,
                      status: 'confirmed',
                      reason: 'Explicitly selected worktree',
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  {tree.locked && <Badge>locked</Badge>}
                  {tree.prunable && <Badge variant="outline">prunable</Badge>}
                  <Button variant="outline" disabled={tree.prunable} onClick={() => void open(tree.path)}>
                    Inspect
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="branches" className="mt-5">
          <div className="divide-y rounded-xl border bg-white">
            {git.data?.branches.map((branch) => (
              <div key={branch.name} className="flex justify-between p-4 text-sm">
                <span>{branch.name}</span>
                <span className="text-xs text-muted-foreground">
                  {branch.upstream ?? 'No upstream'} {branch.tracking}
                </span>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      {selection && (
        <section className="mt-6">
          <div className="mb-3 flex justify-between">
            <h2 className="font-medium">{selection.path ?? 'Commit comparison'}</h2>
            <Button variant="ghost" size="sm" onClick={() => setSelection(null)}>
              Close diff
            </Button>
          </div>
          <ErrorNotice error={diff.error} />
          {diff.isPending ? (
            <Loading />
          ) : (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                {diff.data?.binary ? 'Includes binary changes. ' : ''}
                {diff.data?.truncated ? 'Diff truncated at 256 KB.' : ''}
              </p>
              <pre className="max-h-[500px] overflow-auto rounded-xl bg-[#18231e] p-5 font-mono text-xs leading-6 text-emerald-100">
                {diff.data?.text || 'No text changes in this comparison.'}
              </pre>
            </>
          )}
        </section>
      )}
      {git.data && (
        <footer className="mt-6">
          <Source source={git.data.provenance} />
        </footer>
      )}
    </>
  );
}
