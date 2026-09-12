import { useQueryClient } from '@tanstack/react-query';
import type { Graph, Repository } from '@worklens/contracts';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { query } from '../lib/api';
import { useSession } from '../lib/session';
import { ErrorNotice } from './common';
import { Button } from './ui/button';

export function NxTrustNotice({ graph }: { graph?: Graph }) {
  const { repo, setRepo } = useSession();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const hasNx = graph?.sources.some(
    (source) => source.source === 'nx' || source.source.startsWith('local Nx'),
  );
  if (!repo || (!busy && !error && (repo.trusted || !hasNx))) return null;

  async function enable() {
    if (!repo || busy) return;
    setBusy(true);
    setError('');
    try {
      if (!repo.trusted) {
        const trusted = await query<Repository>('trust', repo.path, { trusted: true });
        if (!mounted.current) return;
        setRepo(trusted);
      }
      // Invalidating the query alone would reload the engine's cached, untrusted graph.
      const refreshed = await query<Graph>('graph', repo.path, { refresh: true });
      client.setQueryData(['graph', repo.path, {}], refreshed);
    } catch (cause) {
      if (mounted.current) setError(String(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section
      aria-label="Nx repository trust"
      className="mb-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4"
    >
      <div className="flex flex-wrap items-center gap-4">
        <ShieldCheck className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-sm font-semibold">
            {repo.trusted
              ? error
                ? 'Nx graph refresh failed'
                : 'Updating the Nx graph'
              : 'Trust this repository to enable Nx'}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {repo.trusted
              ? 'Worklens is collecting the project graph with your repository’s local Nx plugins.'
              : 'Nx analysis is paused. The graph currently shows only the available local sources. Trust allows Nx plugins to execute code from this repository.'}
          </p>
        </div>
        <Button type="button" size="sm" disabled={busy} onClick={() => void enable()}>
          {busy ? 'Loading Nx…' : repo.trusted ? 'Retry graph refresh' : 'Trust repository and enable Nx'}
        </Button>
      </div>
      <ErrorNotice error={error} />
    </section>
  );
}
