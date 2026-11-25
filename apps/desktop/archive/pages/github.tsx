import type { Provenance } from '@worklens/contracts';
import { useState } from 'react';
import { Empty, ErrorNotice, Loading, PageTitle, Source } from '../components/common';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { list, num, record, str } from '../lib/api';
import { useData } from '../lib/session';
import { GithubDetail } from './github-detail';

export type GithubEnvelope = { data: unknown; page: number; perPage: number; provenance: Provenance };
export function GithubPage({ kind }: { kind: 'prs' | 'issues' | 'ci' }) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState('open');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(0);
  const result = useData<GithubEnvelope>(kind, { page, state }, 60_000);
  const all = kind === 'ci' ? list(record(result.data?.data).workflow_runs) : list(result.data?.data);
  const items = all.filter(
    (item) =>
      (kind !== 'issues' || !item.pull_request) &&
      `${str(item.title)} ${str(item.name)} ${str(item.display_title)}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        title={kind === 'prs' ? 'Pull requests' : kind === 'issues' ? 'Issues' : 'Continuous integration'}
        description={
          kind === 'ci'
            ? 'Workflow results tied to the commit actually verified.'
            : 'GitHub delivery, connected to local projects and worktrees.'
        }
      >
        <Button variant="outline" onClick={() => void result.refetch()}>
          Refresh
        </Button>
      </PageTitle>
      <ErrorNotice error={result.error} />
      {selected > 0 ? (
        <>
          <Button variant="ghost" className="mb-4" onClick={() => setSelected(0)}>
            ← Back to list
          </Button>
          <GithubDetail
            kind={kind === 'prs' ? 'pr' : kind === 'issues' ? 'issue' : 'run'}
            number={selected}
          />
        </>
      ) : (
        <>
          <div className="mb-4 flex gap-3">
            <Input
              aria-label="Filter current page"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter this page…"
              className="max-w-sm"
            />
            {kind !== 'ci' && (
              <select
                aria-label="GitHub state"
                className="rounded-md border bg-white px-3 text-sm"
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(1);
                }}
              >
                {['open', 'closed', 'all'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
          {result.isPending && <Loading />}
          {result.data && items.length === 0 && (
            <Empty title="No matching items">No results on this page. Try another filter or page.</Empty>
          )}
          <div className="divide-y overflow-hidden rounded-xl border bg-white">
            {items.map((item) => (
              <button
                key={num(item.id)}
                type="button"
                className="flex w-full items-center gap-4 p-5 text-left hover:bg-muted/30"
                onClick={() => setSelected(num(kind === 'ci' ? item.id : item.number))}
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${item.conclusion === 'failure' ? 'bg-red-500' : item.state === 'open' || item.conclusion === 'success' ? 'bg-emerald-600' : 'bg-slate-400'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {str(item.title) || str(item.display_title) || str(item.name)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {kind === 'ci'
                      ? str(item.head_branch)
                      : `#${num(item.number)} · ${str(record(item.user).login)}`}{' '}
                    · {str(item.updated_at) || str(item.created_at)}
                  </p>
                </div>
                <Badge variant="outline">{str(item.conclusion) || str(item.status) || str(item.state)}</Badge>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <Button variant="outline" disabled={all.length < 30} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </>
      )}
      {result.data && (
        <footer className="mt-6">
          <Source source={result.data.provenance} />
        </footer>
      )}
    </>
  );
}
