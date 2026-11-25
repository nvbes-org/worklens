import { Minus, Plus, Trash2 } from 'lucide-react';
import type { DiffSelection } from '../git-diff';
import { Button } from '../ui/button';
import { computeIntraLineDiff, type WordSpan } from './word-diff';

export interface DiffLine {
  text: string;
  kind: 'meta' | 'added' | 'removed' | 'context';
  oldLine: number | string;
  newLine: number | string;
  hunkLineIndex: number;
}

export interface Hunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
  leftSpans?: WordSpan[];
  rightSpans?: WordSpan[];
}

export function buildSplitRows(hunk: Hunk): SplitRow[] {
  const rows: SplitRow[] = [];
  const lines = hunk.lines;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.kind === 'context') {
      rows.push({ left: line, right: line });
      i++;
      continue;
    }

    // Collect consecutive removed and added lines in this hunk block
    const removed: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === 'removed') {
      removed.push(lines[i]);
      i++;
    }
    const added: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === 'added') {
      added.push(lines[i]);
      i++;
    }

    const maxLen = Math.max(removed.length, added.length);
    for (let k = 0; k < maxLen; k++) {
      const leftLine = removed[k] ?? null;
      const rightLine = added[k] ?? null;

      if (leftLine && rightLine) {
        const { oldSpans, newSpans } = computeIntraLineDiff(leftLine.text, rightLine.text);
        rows.push({
          left: leftLine,
          right: rightLine,
          leftSpans: oldSpans,
          rightSpans: newSpans,
        });
      } else {
        rows.push({
          left: leftLine,
          right: rightLine,
        });
      }
    }
  }

  return rows;
}

export function SplitDiffView({
  fileHeader,
  hunks,
  canStage,
  selection,
  onExecutePatch,
  buildHunkPatch,
  buildLinePatch,
}: {
  fileHeader: string;
  hunks: Hunk[];
  canStage: boolean;
  selection: DiffSelection | null;
  onExecutePatch: (action: 'stage_patch' | 'unstage_patch' | 'discard_patch', patch: string) => void;
  buildHunkPatch: (fileHeader: string, hunk: Hunk) => string;
  buildLinePatch: (fileHeader: string, hunk: Hunk, lineIndex: number) => string;
}) {
  return (
    <div className="divide-y divide-border/60 font-mono text-xs">
      {hunks.map((hunk, hIdx) => {
        const rows = buildSplitRows(hunk);
        return (
          <div key={hIdx} className="hunk-block">
            {/* Hunk Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b text-[11px] text-muted-foreground select-none">
              <span>{hunk.header}</span>
              {canStage && hunk.header && (
                <div className="flex items-center gap-1.5">
                  {selection?.staged ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[10px] px-1.5"
                      onClick={() => onExecutePatch('unstage_patch', buildHunkPatch(fileHeader, hunk))}
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
                        onClick={() => onExecutePatch('stage_patch', buildHunkPatch(fileHeader, hunk))}
                      >
                        <Plus className="size-2.5 mr-1" />
                        Stage Hunk
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 text-[10px] px-1.5 text-red-500 hover:bg-red-500/10"
                        onClick={() => {
                          if (window.confirm('Discard this hunk from working tree?')) {
                            onExecutePatch('discard_patch', buildHunkPatch(fileHeader, hunk));
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

            {/* Split Rows Container */}
            <div className="grid grid-cols-2 divide-x divide-border/50">
              {rows.map((row, rIdx) => (
                <div key={rIdx} className="contents group">
                  {/* Left Column (Old / Removed) */}
                  <div
                    className={`flex items-stretch min-h-[20px] relative px-1 select-text ${
                      row.left
                        ? row.left.kind === 'removed'
                          ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                          : ''
                        : 'bg-muted/20'
                    }`}
                  >
                    <span className="w-10 shrink-0 text-right pr-2 select-none text-[10px] text-muted-foreground/60 border-r border-border/40 mr-1.5">
                      {row.left?.oldLine ?? ''}
                    </span>
                    <span className="flex-1 whitespace-pre break-all leading-5">
                      {row.left ? (
                        row.leftSpans ? (
                          <>
                            <span className="select-none text-red-500 mr-1">-</span>
                            {row.leftSpans.map((span, sIdx) => (
                              <span
                                key={sIdx}
                                className={span.changed ? 'bg-red-300/40 dark:bg-red-900/60 rounded-xs' : ''}
                              >
                                {span.text}
                              </span>
                            ))}
                          </>
                        ) : (
                          row.left.text
                        )
                      ) : (
                        ' '
                      )}
                    </span>
                    {canStage && row.left && row.left.kind === 'removed' && hunk.header && (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center bg-background/90 px-0.5 rounded border shadow-2xs">
                        {selection?.staged ? (
                          <button
                            type="button"
                            title="Unstage line"
                            className="p-0.5 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              onExecutePatch(
                                'unstage_patch',
                                buildLinePatch(fileHeader, hunk, row.left?.hunkLineIndex ?? 0),
                              )
                            }
                          >
                            <Minus className="size-2.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Stage line"
                            className="p-0.5 text-primary hover:bg-primary/10"
                            onClick={() =>
                              onExecutePatch(
                                'stage_patch',
                                buildLinePatch(fileHeader, hunk, row.left?.hunkLineIndex ?? 0),
                              )
                            }
                          >
                            <Plus className="size-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right Column (New / Added) */}
                  <div
                    className={`flex items-stretch min-h-[20px] relative px-1 select-text ${
                      row.right
                        ? row.right.kind === 'added'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : ''
                        : 'bg-muted/20'
                    }`}
                  >
                    <span className="w-10 shrink-0 text-right pr-2 select-none text-[10px] text-muted-foreground/60 border-r border-border/40 mr-1.5">
                      {row.right?.newLine ?? ''}
                    </span>
                    <span className="flex-1 whitespace-pre break-all leading-5">
                      {row.right ? (
                        row.rightSpans ? (
                          <>
                            <span className="select-none text-emerald-500 mr-1">+</span>
                            {row.rightSpans.map((span, sIdx) => (
                              <span
                                key={sIdx}
                                className={
                                  span.changed ? 'bg-emerald-300/40 dark:bg-emerald-900/60 rounded-xs' : ''
                                }
                              >
                                {span.text}
                              </span>
                            ))}
                          </>
                        ) : (
                          row.right.text
                        )
                      ) : (
                        ' '
                      )}
                    </span>
                    {canStage && row.right && row.right.kind === 'added' && hunk.header && (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center bg-background/90 px-0.5 rounded border shadow-2xs">
                        {selection?.staged ? (
                          <button
                            type="button"
                            title="Unstage line"
                            className="p-0.5 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              onExecutePatch(
                                'unstage_patch',
                                buildLinePatch(fileHeader, hunk, row.right?.hunkLineIndex ?? 0),
                              )
                            }
                          >
                            <Minus className="size-2.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Stage line"
                            className="p-0.5 text-primary hover:bg-primary/10"
                            onClick={() =>
                              onExecutePatch(
                                'stage_patch',
                                buildLinePatch(fileHeader, hunk, row.right?.hunkLineIndex ?? 0),
                              )
                            }
                          >
                            <Plus className="size-2.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
