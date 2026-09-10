import { useQuery } from '@tanstack/react-query';
import type {
  Document,
  WorkContextPage,
  WorkContextSection,
  WorkContextSelection,
  WorkItem,
} from '@worklens/contracts';
import { useState } from 'react';
import { ErrorNotice } from '../components/common';
import { Button } from '../components/ui/button';
import { query } from '../lib/api';
import { useSession } from '../lib/session';
import { WorkContextNotes } from './work-context-notes';
import { WorkEvidenceSummary } from './work-evidence-summary';

const sections: [WorkContextSection, string][] = [
  ['summary', 'Saved objective, criteria and state'],
  ['links', 'Declared links (references only)'],
  ['decisions', 'Decision requests and outcomes'],
  ['expectations', 'Local validation expectations (not CI results)'],
];
const empty: WorkContextSelection = {
  sections: [],
  projectIds: [],
  agentIds: [],
  worktreePaths: [],
  documentPaths: [],
  noteIds: [],
  prUrls: [],
};

export function WorkContext({ item, disabled }: { item: WorkItem; disabled: boolean }) {
  const { repo } = useSession();
  const [opened, setOpened] = useState(false);
  const [selection, setSelection] = useState<WorkContextSelection>(empty);
  const [page, setPage] = useState<WorkContextPage | null>(null);
  const [previous, setPrevious] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'markdown' | 'json'>('markdown');
  const documents = useQuery({
    queryKey: ['context-documents', repo?.path],
    queryFn: () => query<Document[]>('documents', repo?.path),
    enabled: Boolean(opened && repo),
  });
  function select(next: WorkContextSelection) {
    setSelection(next);
    setPage(null);
    setPrevious([]);
    setError('');
    setCopied(false);
  }
  function toggle(
    group: 'projectIds' | 'agentIds' | 'worktreePaths' | 'documentPaths' | 'noteIds' | 'prUrls',
    id: string,
  ) {
    select({
      ...selection,
      [group]: selection[group].includes(id)
        ? selection[group].filter((v) => v !== id)
        : [...selection[group], id],
    });
  }
  async function preview(offset?: number, backwards = false) {
    if (!repo) return;
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const result =
        offset !== undefined && page
          ? await query<WorkContextPage>('work_context_page', repo.path, {
              snapshotId: page.snapshotId,
              offset,
              limit: 30,
              maxBytes: 200000,
            })
          : await query<WorkContextPage>('work_context', repo.path, {
              id: item.id,
              expectedRevision: item.revision,
              selection,
              limit: 30,
              maxBytes: 200000,
            });
      setPrevious(
        offset !== undefined && page ? (backwards ? previous.slice(0, -1) : [...previous, page.offset]) : [],
      );
      setPage(result);
    } catch (e) {
      setError(String(e));
      setPage(null);
      setPrevious([]);
    } finally {
      setBusy(false);
    }
  }
  const content = page ? (format === 'markdown' ? page.markdown : JSON.stringify(page, null, 2)) : '';
  const count = Object.values(selection).reduce((sum, ids) => sum + ids.length, 0);
  return (
    <section className="space-y-3 border-t pt-5" aria-label="Work context export">
      <h3 className="font-medium">Selected work context</h3>
      <p className="text-sm text-muted-foreground">
        Export only the sources you select. Local fields use the saved work revision. No GitHub discussions,
        CI logs or conversations. Review the preview for sensitive text before sharing it.
      </p>
      <Button variant="outline" onClick={() => setOpened(!opened)}>
        {opened ? 'Hide context selection' : 'Choose context'}
      </Button>
      {opened && (
        <>
          <ErrorNotice error={error || documents.error} />
          <fieldset className="space-y-2" disabled={disabled || busy}>
            <legend className="mb-2 text-sm">Include in this work export</legend>
            {sections.map(([id, label]) => (
              <label key={id} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selection.sections.includes(id)}
                  onChange={() =>
                    select({
                      ...selection,
                      sections: selection.sections.includes(id)
                        ? selection.sections.filter((s) => s !== id)
                        : [...selection.sections, id],
                    })
                  }
                />
                {label}
              </label>
            ))}
            {item.links
              .filter((link) => link.status === 'confirmed')
              .map((link) => {
                const group =
                  link.kind === 'component'
                    ? 'projectIds'
                    : link.kind === 'agent'
                      ? 'agentIds'
                      : link.kind === 'worktree'
                        ? 'worktreePaths'
                        : null;
                return (
                  group && (
                    <label key={`${link.kind}:${link.reference}`} className="flex gap-2 break-all text-sm">
                      <input
                        type="checkbox"
                        checked={selection[group].includes(link.reference)}
                        onChange={() => toggle(group, link.reference)}
                      />
                      {link.kind}: {link.reference}
                    </label>
                  )
                );
              })}
            <p className="pt-2 text-xs text-muted-foreground">
              Optional PR evidence dossier: selecting one confirmed PR authorizes GitHub reads using your
              connection. Includes changed paths, cached-graph impact and exact-SHA validations; no logs or
              discussions. Choose at most one PR per snapshot.
            </p>
            {item.links
              .filter((link) => link.kind === 'pr' && link.status === 'confirmed')
              .map((link) => (
                <label key={`evidence:${link.reference}`} className="flex gap-2 break-all text-sm">
                  <input
                    type="checkbox"
                    checked={selection.prUrls.includes(link.reference)}
                    disabled={selection.prUrls.length > 0 && !selection.prUrls.includes(link.reference)}
                    onChange={() => toggle('prUrls', link.reference)}
                  />
                  PR evidence: {link.reference}
                </label>
              ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Documents from the selected repository/worktree (not automatically related to this task).
            </p>
            {documents.isPending && <p className="text-sm">Loading document index…</p>}
            <div className="max-h-48 space-y-2 overflow-auto">
              {documents.data?.map((doc) => (
                <label key={doc.path} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selection.documentPaths.includes(doc.path)}
                    onChange={() => toggle('documentPaths', doc.path)}
                  />
                  {doc.path}
                </label>
              ))}
            </div>
            <WorkContextNotes
              item={item}
              selected={selection.noteIds}
              toggle={(id) => toggle('noteIds', id)}
            />
            <Button disabled={count === 0 || count > 100} onClick={() => void preview()}>
              {busy ? 'Collecting selected context…' : 'Preview work context'}
            </Button>
            {count > 100 && <p role="alert">Select at most 100 sections or sources.</p>}
          </fieldset>
          {disabled && (
            <p className="text-sm">Save your work changes before creating an export of the saved revision.</p>
          )}
          {page && (
            <div className="space-y-3">
              <p className="text-sm">
                Snapshot of saved revision {page.workRevision} · {page.collectedAt} · expires {page.expiresAt}
              </p>
              <p className="text-sm" role="status">
                {page.items.length} of {page.total} records · offset {page.offset}
                {page.nextOffset !== null
                  ? ' · More context available; this page is not the full export.'
                  : ' · Final page.'}
              </p>
              <p className="text-xs text-muted-foreground">{page.warning}</p>
              <WorkEvidenceSummary items={page.items} />
              <div className="flex gap-2">
                <label className="text-sm">
                  Export format{' '}
                  <select
                    aria-label="Work context format"
                    value={format}
                    onChange={(e) => {
                      setFormat(e.target.value as 'markdown' | 'json');
                      setCopied(false);
                    }}
                    className="rounded border bg-white p-2"
                  >
                    <option value="markdown">Markdown</option>
                    <option value="json">JSON</option>
                  </select>
                </label>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(content)
                      .then(() => setCopied(true))
                      .catch((e) => setError(String(e)));
                  }}
                >
                  Copy context page
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || previous.length === 0}
                  onClick={() => void preview(previous[previous.length - 1], true)}
                >
                  Previous context page
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || page.nextOffset === null}
                  onClick={() => {
                    if (page.nextOffset !== null) void preview(page.nextOffset);
                  }}
                >
                  Next context page
                </Button>
              </div>
              {copied && <p role="status">Context page copied.</p>}
              <section aria-label="Work context preview">
                <pre className="max-h-96 overflow-auto rounded border bg-white p-4 text-xs">{content}</pre>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
