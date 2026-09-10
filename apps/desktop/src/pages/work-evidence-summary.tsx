import type { WorkContextItem } from '@worklens/contracts';

export function WorkEvidenceSummary({ items }: { items: WorkContextItem[] }) {
  const records = items.filter((item) => item.kind === 'pr_evidence' || item.kind === 'pr_validations');
  if (records.length === 0) return null;
  return (
    <section aria-label="PR evidence on this page" className="space-y-2 border-t pt-3 text-sm">
      <h4 className="font-medium">PR evidence on this page</h4>
      <p className="text-xs text-muted-foreground">
        A dated observation, not permission to merge or proof of completion. Inspect all pages and source
        warnings.
      </p>
      {records.map((record) => {
        const data = record.data;
        const object = typeof data === 'object' && data !== null && !Array.isArray(data) ? data : null;
        const value = object?.value;
        const details = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
        return (
          <div key={record.key} className="space-y-1 break-all border-b pb-2">
            <p>{typeof object?.pr === 'string' ? object.pr : record.key}</p>
            {typeof object?.sha === 'string' && <p>SHA: {object.sha}</p>}
            {typeof details?.filesCollected === 'number' && (
              <p>{details.filesCollected} changed paths collected; see source completeness below.</p>
            )}
            {typeof details?.summary === 'string' && <p>Local expectations: {details.summary}</p>}
            {record.sources.map((source, i) => (
              <p key={`${source.source}:${i}`} className="text-xs">
                {source.source} · {source.status} · {source.collectedAt}
                {source.detail ? ` · ${source.detail}` : ''}
              </p>
            ))}
          </div>
        );
      })}
    </section>
  );
}
