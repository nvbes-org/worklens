import { Link } from '@tanstack/react-router';
import type { WorkChange, WorkItem, WorkLinkKind, WorkLinkStatus } from '@worklens/contracts';
import { useState } from 'react';
import { ExternalLink } from '../components/common';
import { LinkedPrImpact } from '../components/pr-impact';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { LinkedValidations } from '../components/validations';
import { useAgents, useGit, useGraph } from '../lib/session';

export function WorkLinks({
  item,
  apply,
  busy,
}: {
  item: WorkItem;
  apply: (change: WorkChange) => Promise<void>;
  busy: boolean;
}) {
  const [kind, setKind] = useState<WorkLinkKind>('pr');
  const git = useGit();
  const agents = useAgents();
  const graph = useGraph();
  const localSource = kind === 'worktree' || kind === 'agent' || kind === 'component';
  const options =
    kind === 'worktree'
      ? git.data?.worktrees.map((t) => ({ value: t.path, label: t.path }))
      : kind === 'agent'
        ? agents.data?.map((a) => ({ value: a.id, label: `${a.tool}: ${a.objective}` }))
        : kind === 'component'
          ? graph.data?.nodes.filter((n) => !n.external).map((n) => ({ value: n.id, label: n.name }))
          : null;
  return (
    <section className="space-y-3 border-t pt-5">
      <h3 className="font-medium">Linked sources</h3>
      <p className="text-xs text-muted-foreground">
        Confirmed means explicitly declared for this work item, not independently verified. GitHub source
        state is unchanged.
      </p>
      <div className="divide-y">
        {item.links.map((link) => (
          <div key={`${link.kind}:${link.reference}`} className="py-3 text-sm">
            <p className="break-all">
              {link.kind} · {link.reference} · {link.status}
            </p>
            <p className="text-xs text-muted-foreground">{link.reason}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(link.kind === 'pr' || link.kind === 'issue') && <ExternalLink url={link.reference} />}
              <Link
                className="p-2 text-xs underline"
                to="/$view"
                params={{
                  view:
                    link.kind === 'worktree'
                      ? 'git'
                      : link.kind === 'agent'
                        ? 'agents'
                        : link.kind === 'component'
                          ? 'architecture'
                          : link.kind === 'pr'
                            ? 'pull-requests'
                            : 'issues',
                }}
              >
                Browse source
              </Link>
              {link.status === 'candidate' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void apply({
                        action: 'link',
                        link: {
                          ...link,
                          status: 'confirmed',
                          reason: 'Explicitly confirmed by desktop user',
                        },
                      })
                    }
                  >
                    Confirm link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void apply({
                        action: 'link',
                        link: { ...link, status: 'rejected', reason: 'Explicitly rejected by desktop user' },
                      })
                    }
                  >
                    Reject link
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void apply({ action: 'unlink', kind: link.kind, reference: link.reference })}
              >
                Unlink
              </Button>
            </div>
            {link.kind === 'pr' && link.status !== 'rejected' && (
              <LinkedValidations reference={link.reference} workId={item.id} workRevision={item.revision} />
            )}
            {link.kind === 'pr' && link.status !== 'rejected' && (
              <LinkedPrImpact reference={link.reference} />
            )}
          </div>
        ))}
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void apply({
            action: 'link',
            link: {
              kind,
              reference: String(form.get('reference')),
              status: String(form.get('status')) as WorkLinkStatus,
              reason: String(form.get('reason')),
            },
          });
        }}
      >
        <label className="block text-sm">
          Source type{' '}
          <select
            aria-label="Source type"
            className="rounded border bg-white p-2"
            value={kind}
            onChange={(e) => setKind(e.target.value as WorkLinkKind)}
          >
            {['pr', 'issue', 'worktree', 'agent', 'component'].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm" htmlFor="work-reference">
          Source reference
          {localSource ? (
            <select
              key={kind}
              name="reference"
              id="work-reference"
              aria-label="Source reference"
              required
              className="block max-w-full rounded border bg-white p-2"
            >
              <option value="">Choose a source</option>
              {(options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <Input
              key={kind}
              name="reference"
              id="work-reference"
              required
              maxLength={2048}
              placeholder="https://github.com/owner/repository/pull/123"
            />
          )}
        </label>
        <label className="block text-sm">
          Association{' '}
          <select
            name="status"
            aria-label="Association"
            className="rounded border bg-white p-2"
            defaultValue="confirmed"
          >
            <option value="confirmed">Declared association</option>
            <option value="candidate">Candidate to review</option>
          </select>
        </label>
        <label className="block text-sm" htmlFor="work-reason">
          Link reason
          <Input id="work-reason" name="reason" required maxLength={2048} />
        </label>
        <Button disabled={busy}>Add link</Button>
      </form>
    </section>
  );
}
