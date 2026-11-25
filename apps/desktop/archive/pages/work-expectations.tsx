import type { ValidationKind, WorkChange, WorkItem } from '@worklens/contracts';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

export function WorkExpectations({
  item,
  apply,
  busy,
  onDirty,
}: {
  item: WorkItem;
  apply: (change: WorkChange) => Promise<void>;
  busy: boolean;
  onDirty: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const expectations = item.expectations ?? [];
  return (
    <section className="space-y-3 border-t pt-5">
      <h3 className="font-medium">Validation expectations</h3>
      <p className="text-xs text-muted-foreground">
        Local criteria, not GitHub required checks. Names match exactly. Only explicit success satisfies them;
        duplicate matching checks are ambiguous.
      </p>
      <div className="divide-y">
        {expectations.map((e, i) => (
          <div
            className="flex items-center justify-between gap-2 py-2 text-sm"
            key={`${e.repository}:${e.kind}:${e.name}:${e.appId}`}
          >
            <span>
              {e.repository} · {e.kind} · {e.name} · App {e.appId ?? 'unspecified'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || dirty}
              onClick={() =>
                void apply({ action: 'expectations', expectations: expectations.filter((_, n) => n !== i) })
              }
            >
              Remove expectation
            </Button>
          </div>
        ))}
      </div>
      <form
        className="space-y-3"
        onChange={() => {
          setDirty(true);
          onDirty();
        }}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const app = String(form.get('appId'));
          void apply({
            action: 'expectations',
            expectations: [
              ...expectations,
              {
                repository: String(form.get('repository')),
                kind: String(form.get('kind')) as ValidationKind,
                name: String(form.get('name')),
                appId: app ? Number(app) : null,
              },
            ],
          });
        }}
      >
        <fieldset disabled={busy} className="space-y-3">
          <label className="block text-sm" htmlFor="expect-repository">
            Expected repository
            <Input
              id="expect-repository"
              name="repository"
              placeholder="owner/repository"
              required
              maxLength={200}
            />
          </label>
          <label className="block text-sm">
            Control type{' '}
            <select aria-label="Control type" name="kind" className="rounded border bg-white p-2">
              <option value="check">Check run</option>
              <option value="status">Commit status</option>
            </select>
          </label>
          <label className="block text-sm" htmlFor="expect-name">
            Exact control name
            <Input id="expect-name" name="name" required maxLength={200} />
          </label>
          <label className="block text-sm" htmlFor="expect-app">
            GitHub App ID (checks only, optional)
            <Input
              id="expect-app"
              name="appId"
              type="number"
              min={1}
              max={Number.MAX_SAFE_INTEGER}
              step={1}
            />
          </label>
          <Button disabled={busy || expectations.length >= 100}>Add expectation</Button>
        </fieldset>
      </form>
    </section>
  );
}
