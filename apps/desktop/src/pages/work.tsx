import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { WorkDetail, WorkList } from '@worklens/contracts';
import { useState } from 'react';
import { Empty, ErrorNotice, Loading, PageTitle } from '../components/common';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { WorkEntry } from '../components/work-entry';
import { query } from '../lib/api';
import { useData, useSession } from '../lib/session';
import { workStates } from '../lib/work';
import { WorkDetailView } from './work-detail';

export function WorkPage() {
  const { repo } = useSession();
  const { workId, reference } = useSearch({ strict: false });
  return <WorkPageContent key={`${repo?.id}:${workId}:${reference}`} workId={workId} reference={reference} />;
}
function WorkPageContent({ workId, reference }: { workId?: string; reference?: string }) {
  const { repo } = useSession();
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState('');
  const items = useData<WorkList>(
    'work_list',
    { offset, ...(state ? { state } : {}), ...(reference ? { reference } : {}) },
    0,
    !workId,
  );
  const detail = useQuery({
    queryKey: ['work_show', repo?.path, { id: workId ?? '', offset }],
    queryFn: () => query<WorkDetail>('work_show', repo?.path, { id: workId ?? '', offset }),
    enabled: Boolean(repo && workId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <>
      <PageTitle
        title="Work items"
        description="Local objectives, source links and decisions. Completion is declared independently of GitHub and agent state."
      />
      {workId ? (
        <>
          <Button
            variant="ghost"
            onClick={() => void navigate({ to: '/$view', params: { view: 'work' }, search: {} })}
          >
            Back to work items
          </Button>
          <Button variant="outline" onClick={() => void detail.refetch()}>
            Reload work item
          </Button>
          <ErrorNotice error={detail.error} />
          {detail.isPending && <Loading />}
          {detail.data && (
            <WorkDetailView
              key={`${detail.data.item.id}:${detail.data.item.revision}`}
              detail={detail.data}
            />
          )}
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Newer events
            </Button>
            <Button
              variant="outline"
              disabled={detail.data?.nextOffset == null}
              onClick={() => setOffset(detail.data?.nextOffset ?? 0)}
            >
              Older events
            </Button>
          </div>
        </>
      ) : (
        <>
          <WorkEntry />
          <label className="my-4 block text-sm">
            Work state{' '}
            <select
              aria-label="Work state filter"
              className="rounded border bg-white p-2"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All states</option>
              {workStates.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          {reference && (
            <p className="my-3 text-sm">
              Linked source: {reference}{' '}
              <Button
                variant="ghost"
                onClick={() => void navigate({ to: '/$view', params: { view: 'work' }, search: {} })}
              >
                Clear source filter
              </Button>
            </p>
          )}
          <ErrorNotice error={items.error} />
          {items.isPending && <Loading />}
          {items.data?.items.length === 0 && (
            <Empty title="No work items">
              Create a local objective or start from a PR, issue, worktree or agent.
            </Empty>
          )}
          <div className="divide-y rounded border bg-white">
            {items.data?.items.map((item) => (
              <button
                type="button"
                key={item.id}
                className="flex w-full items-center justify-between p-4 text-left"
                onClick={() =>
                  void navigate({ to: '/$view', params: { view: 'work' }, search: { workId: item.id } })
                }
              >
                <span>
                  {item.title}
                  <span className="mt-1 block text-xs text-muted-foreground">{item.objective}</span>
                </span>
                <Badge variant="outline">{item.state}</Badge>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous work items
            </Button>
            <Button
              variant="outline"
              disabled={items.data?.nextOffset == null}
              onClick={() => setOffset(items.data?.nextOffset ?? 0)}
            >
              Next work items
            </Button>
          </div>
        </>
      )}
    </>
  );
}
