import { useQuery } from '@tanstack/react-query';
import type { ValidationReport } from '@worklens/contracts';
import { query } from '../lib/api';
import { useSession } from '../lib/session';
import { ErrorNotice, ExternalLink, Source } from './common';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export function Validations({
  number,
  slug,
  sha,
  workId,
  workRevision,
}: {
  number: number;
  slug?: string;
  sha?: string;
  workId?: string;
  workRevision?: number;
}) {
  const { repo } = useSession();
  const result = useQuery({
    queryKey: ['validations', repo?.path, slug, number, sha, workId, workRevision],
    queryFn: () =>
      query<ValidationReport>('validations', repo?.path, {
        number,
        ...(slug ? { slug } : {}),
        ...(sha ? { sha } : {}),
        ...(workId ? { workId } : {}),
      }),
    enabled: false,
    retry: false,
  });
  const data = result.data;
  return (
    <section className="my-5 space-y-3 border-y py-5" aria-label="Validation center">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">Validation center</h3>
        <Button variant="outline" disabled={!repo || result.isFetching} onClick={() => void result.refetch()}>
          {result.isFetching ? 'Reading validations…' : data ? 'Refresh validations' : 'Read validations'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Expected versus observed checks for an exact commit. No CI execution or GitHub policy changes.
      </p>
      <ErrorNotice error={result.error} />
      {data && (
        <>
          {(result.isFetching || result.isError) && (
            <p className="text-sm text-amber-800">Previous snapshot shown; not freshly verified.</p>
          )}
          <p className="break-all font-mono text-xs">
            {data.repository} · {data.sha}
          </p>
          <Badge variant="outline">
            {data.summary === 'not_configured'
              ? 'No local expectations'
              : data.summary === 'satisfied'
                ? 'Declared expectations satisfied'
                : data.summary === 'attention'
                  ? 'Validation needs attention'
                  : 'Validation unknown'}
          </Badge>
          {data.workRevision !== null && (
            <p className="text-xs">Expectations from work revision {data.workRevision}</p>
          )}
          {!workId && (
            <p className="text-xs">Create or open a related work item to declare local expectations.</p>
          )}
          {data.warnings.map((w) => (
            <p className="text-xs text-amber-800" key={w}>
              {w}
            </p>
          ))}
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="py-2 text-left font-medium">
                Expected controls ({data.assessments.length})
              </caption>
              <thead>
                <tr>
                  <th className="p-2">Control</th>
                  <th className="p-2">Expected source</th>
                  <th className="p-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {data.assessments.map((a, i) => (
                  <tr className="border-t" key={`${a.expectation.name}:${i}`}>
                    <td className="p-2">{a.expectation.name}</td>
                    <td className="p-2">
                      {a.expectation.kind} · App {a.expectation.appId ?? 'unspecified'}
                    </td>
                    <td className="p-2">{a.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary className="cursor-pointer text-sm">
              Observed controls ({data.observations.length})
            </summary>
            <div className="divide-y">
              {data.observations.map((o) => (
                <div className="py-2 text-sm" key={o.id}>
                  <p>
                    {o.name} · {o.outcome} · {o.kind} · App {o.appId ?? 'unspecified'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.id} · {o.rawState} · {o.sha}
                  </p>
                  {o.url && <ExternalLink url={o.url}>Inspect control</ExternalLink>}
                </div>
              ))}
            </div>
          </details>
          {data.sources.map((source) => (
            <Source key={source.source} source={source} />
          ))}
        </>
      )}
    </section>
  );
}

export function LinkedValidations({
  reference,
  workId,
  workRevision,
}: {
  reference: string;
  workId: string;
  workRevision: number;
}) {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)$/.exec(reference);
  return match ? (
    <Validations slug={match[1]} number={Number(match[2])} workId={workId} workRevision={workRevision} />
  ) : null;
}
