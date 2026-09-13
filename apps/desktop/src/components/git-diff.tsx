import { useQuery } from '@tanstack/react-query';
import type { DiffResult } from '@worklens/contracts';
import { FileCode2 } from 'lucide-react';
import { query } from '../lib/api';
import { useSession } from '../lib/session';
import { ErrorNotice, Loading } from './common';

export type DiffSelection = {
  path?: string;
  base?: string;
  head?: string;
  staged?: boolean;
  untracked?: boolean;
};

function linesWithNumbers(text: string) {
  let before = 0;
  let after = 0;
  return text.split('\n').map((text, index) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      before = Number(hunk[1]);
      after = Number(hunk[2]);
    }
    const metadata =
      Boolean(hunk) ||
      /^(diff |index |--- |\+\+\+ |\\|new file |deleted file |rename |similarity )/.test(text);
    const kind = metadata
      ? 'meta'
      : text.startsWith('+')
        ? 'added'
        : text.startsWith('-')
          ? 'removed'
          : 'context';
    const oldLine = !metadata && kind !== 'added' && before ? before++ : '';
    const newLine = !metadata && kind !== 'removed' && after ? after++ : '';
    return { text, index, kind, oldLine, newLine };
  });
}

export function GitDiff({ selection }: { selection: DiffSelection | null }) {
  const { repo } = useSession();
  const diff = useQuery({
    queryKey: ['diff', repo?.path, selection],
    queryFn: () => query<DiffResult>('diff', repo?.path, selection ?? {}),
    enabled: Boolean(repo && selection && !selection.untracked),
  });
  const lines = linesWithNumbers(diff.data?.text ?? '');
  const additions = lines.filter((line) => line.kind === 'added').length;
  const removals = lines.filter((line) => line.kind === 'removed').length;
  return (
    <section className="git-diff" aria-label="Diff viewer">
      <header className="diff-heading">
        <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={selection?.path}>
          {selection?.path ?? (selection?.head ? `Commit ${selection.head.slice(0, 7)}` : 'Select a file')}
        </span>
        {diff.data && (
          <span className="whitespace-nowrap font-mono text-xs">
            <span className="text-emerald-700">+{additions}</span>{' '}
            <span className="text-red-600">−{removals}</span>
          </span>
        )}
        <span className="rounded border px-2 py-1 text-[10px] text-muted-foreground">Unified</span>
      </header>
      <div className="diff-body">
        <ErrorNotice error={diff.error} />
        {!selection ? (
          <div className="diff-empty">
            <FileCode2 className="mb-3 size-7 text-muted-foreground" />
            <p>Select a change to inspect its diff.</p>
          </div>
        ) : selection.untracked ? (
          <div className="diff-empty">Untracked file — no Git diff is available yet.</div>
        ) : diff.isPending ? (
          <div className="px-5">
            <Loading />
          </div>
        ) : !diff.data?.text ? (
          <div className="diff-empty">
            {diff.data?.binary
              ? 'Binary changes cannot be displayed as text.'
              : 'No text changes in this comparison.'}
          </div>
        ) : (
          <pre className="diff-lines">
            {lines.map((line) => (
              <div key={line.index} className={`diff-line ${line.kind}`}>
                <span className="line-number" aria-hidden="true">
                  {line.oldLine}
                </span>
                <span className="line-number" aria-hidden="true">
                  {line.newLine}
                </span>
                <code>{line.text || ' '}</code>
              </div>
            ))}
          </pre>
        )}
      </div>
      <footer className="diff-footer">
        <span>
          {selection?.head
            ? 'Commit comparison'
            : selection?.staged
              ? 'HEAD → index'
              : 'Index → working tree'}
        </span>
        {diff.data?.truncated && <span>Truncated at 256 KB</span>}
        {diff.data?.binary && <span>Includes binary changes</span>}
      </footer>
    </section>
  );
}
