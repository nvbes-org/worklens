import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Impact } from '@worklens/contracts';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ErrorNotice, ExternalLink, Loading, Source } from '../components/common';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { list, num, openUrl, query, record, str } from '../lib/api';
import { useAgents, useData, useGit, useGraph, useSession } from '../lib/session';
import type { GithubEnvelope } from './github';

export function GithubDetail({ kind, number }: { kind: 'pr' | 'issue' | 'run'; number: number }) {
  const { repo } = useSession();
  const [page, setPage] = useState(1);
  const [job, setJob] = useState(0);
  const result = useData<GithubEnvelope>(kind, { number, page });
  const git = useGit();
  const graph = useGraph();
  const agents = useAgents();
  const data = record(result.data?.data);
  const item = record(data[kind]);
  const files = list(record(data.files).data);
  const paths = files.map((f) => str(f.filename));
  const impact = useQuery({
    queryKey: ['impact', repo?.path, paths],
    queryFn: () => query<Impact>('impact', repo?.path, { paths }),
    enabled: kind === 'pr' && files.length > 0,
  });
  const logs = useData<GithubEnvelope>('logs', { number: job }, 0, job > 0);
  const head = record(item.head);
  const headRepo = record(head.repo);
  const sourceRemotes = git.data?.remotes.filter((remote) => {
    const path = remote.url
      .replace(/^git@github.com:/, '')
      .replace(/^https:\/\/github.com\//, '')
      .replace(/^ssh:\/\/git@github.com\//, '')
      .replace(/\.git$/, '');
    return path === str(headRepo.full_name);
  });
  const candidates = sourceRemotes?.length
    ? (git.data?.worktrees.filter((t) => t.branch === str(head.ref)) ?? [])
    : [];
  const trees = candidates.filter(
    (tree) =>
      tree.head === str(head.sha) ||
      git.data?.branches.some(
        (branch) =>
          branch.name === tree.branch &&
          sourceRemotes?.some((remote) => branch.upstream === `${remote.name}/${str(head.ref)}`),
      ),
  );
  return (
    <>
      <ErrorNotice error={result.error} />
      {result.data && <Source source={result.data.provenance} />}
      {result.isPending ? (
        <Loading />
      ) : (
        <>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                {str(item.title) || str(item.display_title) || str(item.name)}
              </h2>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                {str(head.sha) || str(item.head_sha)}
              </p>
            </div>
            {str(item.html_url) && <ExternalLink url={str(item.html_url)} />}
          </div>
          {str(item.body) && (
            <div className="mb-6 space-y-3 rounded-xl border bg-white p-5 text-sm leading-7">
              <ReactMarkdown
                skipHtml
                components={{
                  a: ({ href, children }) => (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        if (href?.startsWith('https://github.com/')) void openUrl(href);
                      }}
                    >
                      {children}
                    </button>
                  ),
                  img: () => null,
                }}
              >
                {str(item.body)}
              </ReactMarkdown>
            </div>
          )}
          {kind === 'pr' && (
            <section className="mb-6 rounded-xl border bg-primary/5 p-5">
              <h3 className="font-medium">Connected local work</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {trees.length
                  ? `${trees.length} matching worktree(s)`
                  : 'No exact source-repository and branch match in local worktrees.'}
              </p>
              {trees.map((t) => (
                <p key={t.id} className="mt-2 font-mono text-xs">
                  {t.path}
                </p>
              ))}
              {candidates.length > trees.length && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {candidates.length - trees.length} same-name worktree candidate(s) lack matching SHA or
                  source upstream; association not confirmed.
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {impact.data?.direct.map((id) => (
                  <Badge variant="outline" key={id}>
                    {graph.data?.nodes.find((n) => n.id === id)?.name ?? id}
                  </Badge>
                ))}
              </div>
              {impact.data && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {impact.data.warning} Based on the current page of changed files.
                </p>
              )}
              {agents.data
                ?.filter((a) => a.pr === str(item.html_url) || trees.some((t) => t.path === a.worktree))
                .map((a) => (
                  <p key={a.id} className="mt-3 text-sm">
                    {a.tool}: {a.objective} · {a.state} ·{' '}
                    {a.pr === str(item.html_url) ? 'declared PR link' : 'same-worktree candidate'}
                  </p>
                ))}
              <Link
                to="/$view"
                params={{ view: 'architecture' }}
                className="mt-3 inline-block text-sm font-medium underline"
              >
                Explore architecture
              </Link>
            </section>
          )}
          {[
            'files',
            'checks',
            'statuses',
            'runs',
            'reviews',
            'comments',
            'review_comments',
            'timeline',
            'jobs',
            'artifacts',
          ]
            .filter((section) => data[section] !== undefined)
            .map((section) => {
              const envelope = record(data[section]);
              const value = envelope.data;
              const object = record(value);
              const rows = Array.isArray(value)
                ? list(value)
                : list(
                    object.check_runs ??
                      object.statuses ??
                      object.workflow_runs ??
                      object.jobs ??
                      object.artifacts,
                  );
              return (
                <section key={section} className="mb-6">
                  <h3 className="mb-3 text-sm font-semibold capitalize">{section}</h3>
                  <ErrorNotice error={envelope.error} />
                  <div className="divide-y rounded-xl border bg-white">
                    {rows.map((row, i) => (
                      <div key={`${num(row.id)}:${i}`} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm">
                            {str(row.filename) ||
                              str(row.name) ||
                              str(row.context) ||
                              str(row.event) ||
                              str(record(row.user).login) ||
                              'Comment'}
                          </span>
                          <div className="flex items-center gap-2">
                            {Boolean(row.conclusion || row.status || row.state) && (
                              <Badge variant="outline">
                                {str(row.conclusion) || str(row.status) || str(row.state)}
                              </Badge>
                            )}
                            {section === 'jobs' && (
                              <Button variant="outline" size="sm" onClick={() => setJob(num(row.id))}>
                                Read logs
                              </Button>
                            )}
                            {str(row.html_url) && <ExternalLink url={str(row.html_url)}>View</ExternalLink>}
                            {section === 'artifacts' && str(item.html_url) && (
                              <ExternalLink url={str(item.html_url)}>Download from run</ExternalLink>
                            )}
                            {section === 'timeline' && str(record(record(row.source).issue).html_url) && (
                              <ExternalLink url={str(record(record(row.source).issue).html_url)}>
                                Linked issue or PR
                              </ExternalLink>
                            )}
                          </div>
                        </div>
                        {str(row.body) && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                            {str(row.body)}
                          </p>
                        )}
                        {str(row.patch) && (
                          <pre className="mt-3 max-h-64 overflow-auto bg-muted/40 p-3 font-mono text-xs leading-5">
                            {str(row.patch)}
                          </pre>
                        )}
                        {section === 'jobs' && (
                          <div className="mt-3 space-y-2">
                            {list(row.steps).map((step) => (
                              <div
                                key={num(step.number)}
                                className="flex justify-between text-xs text-muted-foreground"
                              >
                                <span>{str(step.name)}</span>
                                <span>{str(step.conclusion) || str(step.status)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {rows.length === 0 && !envelope.error && (
                    <p className="text-xs text-muted-foreground">No entries reported on this page.</p>
                  )}
                </section>
              );
            })}
          {job > 0 && (
            <section className="mb-6">
              <h3 className="font-medium">Job logs</h3>
              <ErrorNotice error={logs.error} />
              {logs.isPending ? (
                <Loading />
              ) : (
                <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[#18231e] p-4 text-xs text-emerald-100">
                  {str(record(logs.data?.data).text)}
                </pre>
              )}
              {record(logs.data?.data).truncated === true && (
                <p className="text-xs text-muted-foreground">Truncated at 256 KB.</p>
              )}
            </section>
          )}
          <div className="flex gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous details
            </Button>
            <span className="self-center text-xs text-muted-foreground">Page {page}</span>
            <Button variant="outline" onClick={() => setPage(page + 1)}>
              Next details
            </Button>
          </div>
        </>
      )}
    </>
  );
}
