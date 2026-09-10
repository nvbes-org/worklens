import { useQuery } from '@tanstack/react-query';
import type { WorkDetail, WorkItem } from '@worklens/contracts';
import { useState } from 'react';
import { ErrorNotice } from '../components/common';
import { Button } from '../components/ui/button';
import { query } from '../lib/api';
import { useSession } from '../lib/session';

export function WorkContextNotes({
  item,
  selected,
  toggle,
}: {
  item: WorkItem;
  selected: string[];
  toggle: (id: string) => void;
}) {
  const { repo } = useSession();
  const [offset, setOffset] = useState(0);
  const history = useQuery({
    queryKey: ['context-notes', repo?.path, item.id, item.revision, offset],
    queryFn: async () => {
      const detail = await query<WorkDetail>('work_show', repo?.path, { id: item.id, offset });
      if (detail.item.revision !== item.revision)
        throw new Error('Work changed. Reload the work item to select notes.');
      return detail;
    },
    enabled: Boolean(repo),
  });
  const notes = history.isError
    ? []
    : (history.data?.events.filter((event) => event.action === 'note') ?? []);
  return (
    <section aria-label="Notes for context" className="space-y-2 border-t pt-3">
      <h4 className="text-sm font-medium">Individual local notes</h4>
      <p className="text-xs text-muted-foreground">
        None included by default. Browse history pages to find older notes. Authors are declared, not
        authenticated.
      </p>
      <ErrorNotice error={history.error} />
      {history.isPending && <p className="text-sm">Loading note history…</p>}
      {history.data && !history.isError && notes.length === 0 && (
        <p className="text-sm">No notes on this history page.</p>
      )}
      <div className="max-h-48 space-y-2 overflow-auto">
        {notes.map((note) => (
          <label key={note.eventId} className="flex gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={`Include note ${note.eventId}`}
              checked={selected.includes(note.eventId)}
              onChange={() => toggle(note.eventId)}
            />
            <span className="min-w-0 break-words">
              <span className="block text-xs text-muted-foreground">
                {note.actor} · {note.createdAt} · revision {note.revision}
              </span>
              <span className="whitespace-pre-wrap">
                {typeof note.details === 'object' &&
                note.details !== null &&
                'text' in note.details &&
                typeof note.details.text === 'string'
                  ? note.details.text
                  : 'Note text unavailable'}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={history.isFetching || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Newer note history
        </Button>
        <Button
          variant="outline"
          disabled={history.isFetching || history.isError || history.data?.nextOffset == null}
          onClick={() => {
            if (history.data?.nextOffset != null) setOffset(history.data.nextOffset);
          }}
        >
          Older note history
        </Button>
      </div>
      {selected.length > 0 && (
        <div className="space-y-1 text-xs">
          <p>{selected.length} notes selected across history pages:</p>
          {selected.map((id) => (
            <div key={id} className="flex items-center gap-2 break-all">
              <span>{id}</span>
              <Button variant="outline" onClick={() => toggle(id)} aria-label={`Remove selected note ${id}`}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
