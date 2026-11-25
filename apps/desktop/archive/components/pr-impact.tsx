import { useQuery } from '@tanstack/react-query';
import type { PrImpact } from '@worklens/contracts';
import { query } from '../lib/api';
import { useSession } from '../lib/session';
import { ErrorNotice, Source } from './common';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export function PrImpactView({ number, slug, headSha }: { number: number; slug?: string; headSha?: string }) {
  const { repo } = useSession();
  const result = useQuery({
    queryKey: ['pr_impact', repo?.path, slug, number, headSha],
    queryFn: () => query<PrImpact>('pr_impact', repo?.path, { number, ...(slug ? { slug } : {}) }),
    enabled: false,
    retry: false,
  });
  const data = result.data;
  const collection = data?.collection;
  const changed = Boolean(headSha && collection && headSha !== collection.revision.headSha);
  return (
    <section className="my-5 space-y-3 border-y py-5" aria-label="Full PR impact">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">Full PR impact{slug ? ` · ${slug} #${number}` : ''}</h3>
        <Button variant="outline" disabled={!repo || result.isFetching} onClick={() => void result.refetch()}>
          {result.isFetching ? 'Analyzing entire PR…' : data ? 'Refresh PR impact' : 'Analyze entire PR'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        All file pages, independent of the details page below. Dependency reachability is an estimate, not
        proof of sufficient validation.
      </p>
      <ErrorNotice error={result.error} />
      {data && collection && (
        <>
          {(result.isError || result.isFetching) && (
            <p className="text-sm text-amber-800">Previous snapshot shown; not a newly verified result.</p>
          )}
          {changed && (
            <p role="alert" className="text-sm text-amber-800">
              This analysis and the displayed PR details have different head SHAs. Refresh the PR details and
              analysis.
            </p>
          )}
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">
              {collection.provenance.status === 'available' && collection.revisionVerified
                ? 'Complete file collection'
                : 'Partial file collection'}
            </Badge>
            <span>
              {collection.files.length} / {collection.revision.expectedFiles} files ·{' '}
              {collection.pagesCollected} page(s)
            </span>
            <span>
              {collection.revisionVerified
                ? 'Revision checked before and after'
                : 'Revision unverified — impact withheld'}
            </span>
          </div>
          <Source source={collection.provenance} />
          <div className="break-all font-mono text-xs text-muted-foreground">
            <p>
              Base: {collection.revision.baseRepository} · {collection.revision.baseSha}
            </p>
            <p>
              Head: {collection.revision.headRepository ?? 'Deleted or inaccessible source repository'} ·{' '}
              {collection.revision.headSha}
            </p>
            <p>
              Local graph: {data.graphWorktree} · {data.graphHead ?? 'Unknown HEAD'}
            </p>
            <p>
              {data.graphMatchesHead
                ? 'Clean local checkout matches sampled PR head'
                : 'Local graph does not match verified PR head'}
            </p>
          </div>
          {[...collection.warnings, ...data.warnings].map((warning) => (
            <p className="text-xs text-amber-800" key={warning}>
              {warning}
            </p>
          ))}
          {collection.revisionVerified && (
            <>
              <h4 className="text-sm font-medium">
                Directly concerned components ({data.impact.direct.length})
              </h4>
              {data.impact.direct.map(({ project, paths }) => (
                <details className="border-t py-2 text-sm" key={project.id}>
                  <summary className="cursor-pointer">
                    {project.name} · {project.ecosystem}
                  </summary>
                  <p className="mt-2 font-mono text-xs">{project.manifest}</p>
                  <p className="text-xs">Matched current or previous paths under {project.root || '.'}:</p>
                  <ul className="mt-2 list-inside list-disc text-xs">
                    {paths.map((path) => (
                      <li key={path}>{path}</li>
                    ))}
                  </ul>
                </details>
              ))}
              <h4 className="text-sm font-medium">Transitive dependants ({data.impact.dependants.length})</h4>
              {data.impact.dependants.map(({ project, via }) => (
                <details className="border-t py-2 text-sm" key={project.id}>
                  <summary className="cursor-pointer">
                    {project.name} · {project.ecosystem}
                  </summary>
                  <p className="mt-2 font-mono text-xs">{project.manifest}</p>
                  <p className="text-xs">
                    {via.source} → {via.target} · {via.kind} · {via.evidence} · {via.origin}
                  </p>
                </details>
              ))}
              <details className="text-sm">
                <summary className="cursor-pointer">Unmatched paths ({data.impact.unmatched.length})</summary>
                <p className="text-xs">
                  No local component owns these paths. Removed components or missing connectors may explain
                  this.
                </p>
                {data.impact.unmatched.map((path) => (
                  <p key={path} className="font-mono text-xs">
                    {path}
                  </p>
                ))}
              </details>
              <details className="text-sm">
                <summary className="cursor-pointer">
                  Workspace-wide files ({data.impact.transversal.length})
                </summary>
                <p className="text-xs">
                  Configuration and lockfiles may affect more than path ownership reveals. Review manually.
                </p>
                {data.impact.transversal.map((path) => (
                  <p key={path} className="font-mono text-xs">
                    {path}
                  </p>
                ))}
              </details>
            </>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer">Collected files ({collection.files.length})</summary>
            <div className="mt-2 max-h-64 overflow-auto font-mono text-xs">
              {collection.files.map((file) => (
                <p key={file.path}>
                  {file.status} · {file.previousPath ? `${file.previousPath} → ` : ''}
                  {file.path}
                </p>
              ))}
            </div>
          </details>
          <details className="text-sm">
            <summary className="cursor-pointer">Graph sources and limitations</summary>
            <div className="mt-2 space-y-2">
              {data.graphSources.map((source, i) => (
                <Source key={`${source.source}:${i}`} source={source} />
              ))}
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function LinkedPrImpact({ reference }: { reference: string }) {
  const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)\/?$/.exec(reference);
  return match ? <PrImpactView slug={match[1]} number={Number(match[2])} /> : null;
}
