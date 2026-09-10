import { Link } from '@tanstack/react-router';
import type { Provenance } from '@worklens/contracts';
import { list, record, str } from '../lib/api';
import { useData } from '../lib/session';
import { ErrorNotice, Source } from './common';
import { Badge } from './ui/badge';

type Envelope = { data: unknown; provenance: Provenance };
export function DeliverySummary() {
  const auth = useData<{ connected: boolean }>('github_auth_status');
  const prs = useData<Envelope>('prs', { page: 1, state: 'open' }, 60_000, auth.data?.connected === true);
  const runs = useData<Envelope>('ci', { page: 1 }, 60_000, auth.data?.connected === true);
  return (
    <section className="mt-8 border-t pt-6">
      <h2 className="mb-4 font-semibold">Delivery signals</h2>
      {!auth.data?.connected ? (
        <p className="text-sm text-muted-foreground">
          Connect GitHub in Settings to add pull requests and validation results. Local views remain
          available.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {[
            { title: 'Open pull requests', view: 'pull-requests', query: prs, rows: list(prs.data?.data) },
            {
              title: 'Recent validations',
              view: 'ci',
              query: runs,
              rows: list(record(runs.data?.data).workflow_runs),
            },
          ].map((group) => (
            <div key={group.view}>
              <Link to="/$view" params={{ view: group.view }} className="text-sm font-medium underline">
                {group.title}
              </Link>
              <ErrorNotice error={group.query.error} />
              <div className="mt-3 divide-y">
                {group.rows.slice(0, 5).map((item) => (
                  <Link
                    key={str(item.html_url)}
                    to="/$view"
                    params={{ view: group.view }}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <span className="truncate">
                      {str(item.title) || str(item.display_title) || str(item.name)}
                    </span>
                    <Badge variant="outline">
                      {str(item.conclusion) || str(item.status) || str(item.state)}
                    </Badge>
                  </Link>
                ))}
              </div>
              {group.query.data && <Source source={group.query.data.provenance} />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
