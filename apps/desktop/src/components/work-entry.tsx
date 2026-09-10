import { useNavigate } from '@tanstack/react-router';
import type { WorkLink } from '@worklens/contracts';
import { useId, useState } from 'react';
import { useWorkChange } from '../lib/work';
import { ErrorNotice } from './common';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function WorkEntry({ title = '', source }: { title?: string; source?: WorkLink }) {
  const prefix = useId();
  const [createId] = useState(() => crypto.randomUUID());
  const navigate = useNavigate();
  const change = useWorkChange();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="my-3 space-y-3">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setCreating(!creating)}>
          Create work item
        </Button>
        {source && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void navigate({
                to: '/$view',
                params: { view: 'work' },
                search: { reference: source.reference },
              })
            }
          >
            Related work items
          </Button>
        )}
      </div>
      {creating && (
        <form
          className="space-y-3 border-l-2 pl-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setError('');
            setBusy(true);
            void change(
              { id: createId, revision: 0 },
              {
                action: 'create',
                title: String(form.get('title')),
                objective: String(form.get('objective')),
                criteria: String(form.get('criteria')),
                links: source ? [source] : [],
              },
            )
              .then((item) =>
                navigate({ to: '/$view', params: { view: 'work' }, search: { workId: item.id } }),
              )
              .catch((e) => setError(String(e)))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block text-sm" htmlFor={`${prefix}-title`}>
            Work title
            <Input id={`${prefix}-title`} name="title" defaultValue={title} required maxLength={200} />
          </label>
          <label className="block text-sm" htmlFor={`${prefix}-objective`}>
            Objective
            <Input id={`${prefix}-objective`} name="objective" required maxLength={8192} />
          </label>
          <label className="block text-sm" htmlFor={`${prefix}-criteria`}>
            Result criteria
            <Input id={`${prefix}-criteria`} name="criteria" maxLength={16384} />
          </label>
          <p className="text-xs text-muted-foreground">
            Local Worklens data only. Source associations are declared, not proof of delivery.
          </p>
          <ErrorNotice error={error} />
          <Button disabled={busy}>Save work item</Button>
        </form>
      )}
    </div>
  );
}
