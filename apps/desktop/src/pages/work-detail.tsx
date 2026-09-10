import type { WorkChange, WorkDetail, WorkState } from '@worklens/contracts';
import { useState } from 'react';
import { ErrorNotice } from '../components/common';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useWorkChange, workStates } from '../lib/work';
import { WorkExpectations } from './work-expectations';
import { WorkLinks } from './work-links';

export function WorkDetailView({ detail }: { detail: WorkDetail }) {
  const { item } = detail;
  const change = useWorkChange();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expectationDirty, setExpectationDirty] = useState(false);
  async function apply(value: WorkChange) {
    setBusy(true);
    setError('');
    try {
      await change(item, value);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5 space-y-6">
      <h2 className="text-xl font-semibold">{item.title}</h2>
      <p className="font-mono text-xs text-muted-foreground">
        {item.id} · revision {item.revision} · {item.updatedAt}
      </p>
      <ErrorNotice error={error} />
      <form
        className="space-y-3"
        onChange={() => setDirty(true)}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void apply({
            action: 'update',
            title: String(form.get('title')),
            objective: String(form.get('objective')),
            criteria: String(form.get('criteria')),
            state: String(form.get('state')) as WorkState,
          });
        }}
      >
        <fieldset disabled={expectationDirty} className="space-y-3">
          <label className="block text-sm" htmlFor="work-title">
            Work title
            <Input id="work-title" name="title" defaultValue={item.title} required maxLength={200} />
          </label>
          <label className="block text-sm" htmlFor="work-objective">
            Objective
            <Input
              id="work-objective"
              name="objective"
              defaultValue={item.objective}
              required
              maxLength={8192}
            />
          </label>
          <label className="block text-sm" htmlFor="work-criteria">
            Result criteria
            <Input id="work-criteria" name="criteria" defaultValue={item.criteria} maxLength={16384} />
          </label>
          <label className="block text-sm">
            Declared work state{' '}
            <select
              name="state"
              aria-label="Declared work state"
              className="rounded border bg-white p-2"
              defaultValue={item.state}
            >
              {workStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy || expectationDirty}>Save changes</Button>
        </fieldset>
      </form>
      {dirty && (
        <p className="text-sm text-muted-foreground">
          Save your field changes before editing links or adding a note. Reload discards unsaved fields.
        </p>
      )}
      {expectationDirty && (
        <p className="text-sm text-muted-foreground">
          Save the expectation draft before other changes. Reload discards the draft.
        </p>
      )}
      <WorkExpectations
        item={item}
        apply={apply}
        busy={busy || dirty}
        onDirty={() => setExpectationDirty(true)}
      />
      <WorkLinks item={item} apply={apply} busy={busy || dirty || expectationDirty} />
      <section className="border-t pt-5">
        <h3 className="mb-3 font-medium">Local notes</h3>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void apply({ action: 'note', text: String(form.get('note')) });
          }}
        >
          <Input
            name="note"
            aria-label="Local note"
            required
            maxLength={8192}
            placeholder="Not posted to GitHub"
          />
          <Button disabled={busy || dirty || expectationDirty}>Add note</Button>
        </form>
      </section>
      <section className="border-t pt-5">
        <h3 className="font-medium">Work history</h3>
        <p className="my-2 text-xs text-muted-foreground">
          Newest first. Actor names and links are declared locally, not authenticated identities or GitHub
          comments.
        </p>
        <ol className="divide-y">
          {detail.events.map((event) => (
            <li key={event.eventId} className="py-3 text-sm">
              <p>
                {event.action} · revision {event.revision} · {event.actor} · {event.createdAt}
              </p>
              <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-muted-foreground">
                {JSON.stringify(event.details, null, 2)}
              </pre>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
