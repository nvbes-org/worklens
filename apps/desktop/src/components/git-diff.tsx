import { useQuery } from '@tanstack/react-query';
import type { DiffResult } from '@worklens/contracts';
import { Columns2, Edit3, FileCode2, Minus, Plus, Rows2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { query } from '../lib/api';
import { useGit, useSession } from '../lib/session';
import { ErrorNotice, Loading } from './common';
import { type Hunk, SplitDiffView } from './git-diff/split-diff-view';
import { Button } from './ui/button';

export type DiffSelection = {
  path?: string;
  base?: string;
  head?: string;
  staged?: boolean;
  untracked?: boolean;
};

export function parseHunks(text: string): { fileHeader: string; hunks: Hunk[] } {
  const allLines = text.split('\n');
  const fileHeaderLines: string[] = [];
  const hunks: Hunk[] = [];

  let currentHunk: Hunk | null = null;
  let before = 0;
  let after = 0;

  for (const line of allLines) {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line);
    if (match) {
      if (currentHunk) hunks.push(currentHunk);
      before = Number(match[1]);
      after = Number(match[2]);
      currentHunk = {
        header: line,
        oldStart: before,
        newStart: after,
        lines: [],
      };
      continue;
    }

    if (!currentHunk) {
      fileHeaderLines.push(line);
      continue;
    }

    const kind = line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'context';
    const oldLine = kind !== 'added' && before ? before++ : '';
    const newLine = kind !== 'removed' && after ? after++ : '';

    currentHunk.lines.push({
      text: line,
      kind,
      oldLine,
      newLine,
      hunkLineIndex: currentHunk.lines.length,
    });
  }

  if (currentHunk) hunks.push(currentHunk);

  if (hunks.length === 0 && fileHeaderLines.length > 0) {
    const defaultHunk: Hunk = {
      header: '',
      oldStart: 0,
      newStart: 0,
      lines: [],
    };
    for (const line of fileHeaderLines) {
      const kind = line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : 'context';
      defaultHunk.lines.push({
        text: line,
        kind,
        oldLine: '',
        newLine: '',
        hunkLineIndex: defaultHunk.lines.length,
      });
    }
    hunks.push(defaultHunk);
  }

  return { fileHeader: fileHeaderLines.join('\n'), hunks };
}

export function buildHunkPatch(fileHeader: string, hunk: Hunk): string {
  const linesText = hunk.lines.map((l) => l.text).join('\n');
  return `${fileHeader}\n${hunk.header}\n${linesText}\n`;
}

export function buildLinePatch(fileHeader: string, hunk: Hunk, lineIndex: number): string {
  let oldCount = 0;
  let newCount = 0;
  const patchLines: string[] = [];

  for (let i = 0; i < hunk.lines.length; i++) {
    const l = hunk.lines[i];
    if (l.kind === 'context') {
      oldCount++;
      newCount++;
      patchLines.push(l.text);
    } else if (l.kind === 'removed') {
      oldCount++;
      if (i === lineIndex) {
        patchLines.push(l.text);
      } else {
        newCount++;
        patchLines.push(` ${l.text.slice(1)}`);
      }
    } else if (l.kind === 'added') {
      if (i === lineIndex) {
        newCount++;
        patchLines.push(l.text);
      }
    }
  }

  const header = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`;
  return `${fileHeader}\n${header}\n${patchLines.join('\n')}\n`;
}

export function GitDiff({
  selection,
  onOpenEditor,
}: {
  selection: DiffSelection | null;
  onOpenEditor?: (path: string) => void;
}) {
  const { repo } = useSession();
  const git = useGit();
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'inline' | 'split'>('inline');

  const diff = useQuery({
    queryKey: ['diff', repo?.path, selection],
    queryFn: () => query<DiffResult>('diff', repo?.path, selection ?? {}),
    enabled: Boolean(repo && selection && !selection.untracked),
  });

  const { fileHeader, hunks } = parseHunks(diff.data?.text ?? '');
  const canStage = Boolean(repo && selection && !selection.head && !selection.untracked);

  async function executePatch(patchAction: 'stage_patch' | 'unstage_patch' | 'discard_patch', patch: string) {
    if (!repo) return;
    setActionError(null);
    try {
      await query('git_action', repo.path, { action: patchAction, patch });
      await Promise.all([diff.refetch(), git.refetch()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="git-diff" aria-label="Diff viewer">
      <header className="diff-heading flex items-center justify-between gap-2 px-3 py-2 border-b">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={selection?.path}>
            {selection?.path ?? (selection?.head ? `Commit ${selection.head.slice(0, 7)}` : 'Select a file')}
          </span>
          {selection?.path && onOpenEditor && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2 text-primary hover:bg-primary/10"
              onClick={() => {
                if (selection?.path) onOpenEditor(selection.path);
              }}
              title="Edit in in-app code editor"
            >
              <Edit3 className="size-3 mr-1" />
              Edit
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded border">
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded cursor-pointer ${
              viewMode === 'inline'
                ? 'bg-background shadow-2xs font-medium text-foreground'
                : 'text-muted-foreground'
            }`}
            onClick={() => setViewMode('inline')}
            title="Unified (Inline) diff view"
          >
            <Rows2 className="size-3" />
            Inline
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded cursor-pointer ${
              viewMode === 'split'
                ? 'bg-background shadow-2xs font-medium text-foreground'
                : 'text-muted-foreground'
            }`}
            onClick={() => setViewMode('split')}
            title="Side-by-side (Split) diff view"
          >
            <Columns2 className="size-3" />
            Split
          </button>
        </div>
      </header>
      <div className="diff-body">
        <ErrorNotice error={diff.error || (actionError ? new Error(actionError) : null)} />
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
        ) : viewMode === 'split' ? (
          <SplitDiffView
            fileHeader={fileHeader}
            hunks={hunks}
            canStage={canStage}
            selection={selection}
            onExecutePatch={(act, p) => void executePatch(act, p)}
            buildHunkPatch={buildHunkPatch}
            buildLinePatch={buildLinePatch}
          />
        ) : (
          <div className="divide-y divide-border/60">
            {hunks.map((hunk, hIdx) => (
              <div key={hIdx} className="hunk-block">
                {hunk.header ? (
                  <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b font-mono text-[11px] text-muted-foreground select-none">
                    <span>{hunk.header}</span>
                    {canStage && (
                      <div className="flex items-center gap-1.5">
                        {selection.staged ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              void executePatch('unstage_patch', buildHunkPatch(fileHeader, hunk))
                            }
                          >
                            <Minus className="size-2.5 mr-1" />
                            Unstage Hunk
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[10px] px-1.5 text-primary hover:bg-primary/10"
                              onClick={() =>
                                void executePatch('stage_patch', buildHunkPatch(fileHeader, hunk))
                              }
                            >
                              <Plus className="size-2.5 mr-1" />
                              Stage Hunk
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[10px] px-1.5 text-red-500 hover:bg-red-500/10"
                              onClick={() => {
                                if (window.confirm('Discard this entire hunk from working tree?')) {
                                  void executePatch('discard_patch', buildHunkPatch(fileHeader, hunk));
                                }
                              }}
                            >
                              <Trash2 className="size-2.5 mr-1" />
                              Discard Hunk
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Hunk Lines */}
                <div className="diff-lines">
                  {hunk.lines.map((line, lIdx) => {
                    const isMod = line.kind === 'added' || line.kind === 'removed';
                    return (
                      <div key={lIdx} className={`diff-line ${line.kind} group relative`}>
                        <span className="line-number" aria-hidden="true">
                          {line.oldLine}
                        </span>
                        <span className="line-number" aria-hidden="true">
                          {line.newLine}
                        </span>
                        <code className="flex-1">{line.text || ' '}</code>

                        {/* Line-level staging & discard buttons */}
                        {canStage && isMod && Boolean(hunk.header) && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center gap-1 bg-background/90 px-1 py-0.5 rounded border shadow-2xs transition-opacity">
                            {selection.staged ? (
                              <button
                                type="button"
                                title="Unstage line"
                                className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                                onClick={() =>
                                  void executePatch('unstage_patch', buildLinePatch(fileHeader, hunk, lIdx))
                                }
                              >
                                <Minus className="size-3" />
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  title="Stage line"
                                  className="p-0.5 text-primary hover:bg-primary/10 rounded"
                                  onClick={() =>
                                    void executePatch('stage_patch', buildLinePatch(fileHeader, hunk, lIdx))
                                  }
                                >
                                  <Plus className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Discard line"
                                  className="p-0.5 text-red-500 hover:bg-red-500/10 rounded"
                                  onClick={() => {
                                    if (window.confirm('Discard this line?')) {
                                      void executePatch(
                                        'discard_patch',
                                        buildLinePatch(fileHeader, hunk, lIdx),
                                      );
                                    }
                                  }}
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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
      </footer>
    </section>
  );
}
