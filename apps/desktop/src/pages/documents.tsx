import { useQuery } from '@tanstack/react-query';
import type { Document } from '@worklens/contracts';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ErrorNotice, Loading, PageTitle } from '../components/common';
import { Button } from '../components/ui/button';
import { openSource, query } from '../lib/api';
import { useData, useSession } from '../lib/session';

export function DocumentsPage() {
  const { repo } = useSession();
  const documents = useData<Document[]>('documents');
  const [path, setPath] = useState('');
  const [exported, setExported] = useState('');
  const [error, setError] = useState('');
  const [sections, setSections] = useState<string[]>(['git']);
  const doc = useQuery({
    queryKey: ['document', repo?.path, path],
    queryFn: () => query<{ text: string }>('document', repo?.path, { path }),
    enabled: Boolean(path && repo),
  });
  async function exportContext() {
    try {
      const result = await query<{ markdown: string; nextOffset: number | null }>('context', repo?.path, {
        sections,
        paths: path ? [path] : [],
        limit: 30,
      });
      setExported(
        `${result.markdown}${result.nextOffset !== null ? `\n\nMore context available at offset ${result.nextOffset}.` : ''}`,
      );
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <PageTitle
        title="Documentation & context"
        description="Repository documentation, with bounded context exports for your agents."
      >
        <Button variant="outline" disabled={sections.length === 0} onClick={() => void exportContext()}>
          Export selected context
        </Button>
      </PageTitle>
      <ErrorNotice error={documents.error || doc.error || error} />
      <fieldset className="mb-5 flex flex-wrap gap-5 text-xs">
        <legend className="mb-2 text-muted-foreground">Include in export</legend>
        {['git', 'projects', 'agents', 'documents'].map((section) => (
          <label key={section} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sections.includes(section)}
              disabled={section === 'documents' && !path}
              onChange={(event) =>
                setSections((current) =>
                  event.target.checked ? [...current, section] : current.filter((item) => item !== section),
                )
              }
            />
            {section === 'documents' ? 'Selected document' : section}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-[260px_1fr] gap-6">
        <nav className="space-y-1">
          {documents.data?.map((d) => (
            <button
              key={d.path}
              type="button"
              onClick={() => {
                setPath(d.path);
                setSections((current) =>
                  current.includes('documents') ? current : [...current, 'documents'],
                );
              }}
              className={`w-full truncate rounded-md p-2.5 text-left text-xs ${path === d.path ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
            >
              {d.path}
            </button>
          ))}
        </nav>
        <section className="min-w-0 rounded-xl border bg-white p-6">
          {!path ? (
            <p className="text-sm text-muted-foreground">
              Select a README, ADR or agent instruction document.
            </p>
          ) : doc.isPending ? (
            <Loading />
          ) : (
            <>
              <div className="mb-5 flex justify-between">
                <h2 className="font-mono text-xs">{path}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (repo) void openSource(repo.path, path, true).catch((e) => setError(String(e)));
                  }}
                >
                  Open in text editor
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (repo) void openSource(repo.path, path).catch((e) => setError(String(e)));
                  }}
                >
                  Reveal file
                </Button>
              </div>
              <div className="space-y-4 text-sm leading-7 [&_h1]:text-2xl [&_h2]:text-xl [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-4 [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown
                  skipHtml
                  components={{
                    img: () => null,
                    a: ({ children }) => <span className="underline">{children}</span>,
                  }}
                >
                  {doc.data?.text ?? ''}
                </ReactMarkdown>
              </div>
            </>
          )}
        </section>
      </div>
      {exported && (
        <section className="mt-6">
          <div className="mb-3 flex justify-between">
            <h2 className="font-semibold">Context preview</h2>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(exported).catch((e) => setError(String(e)));
              }}
            >
              Copy Markdown
            </Button>
          </div>
          <pre className="max-h-80 overflow-auto rounded-xl border bg-white p-5 text-xs leading-6">
            {exported}
          </pre>
        </section>
      )}
    </>
  );
}
