import { useQuery } from '@tanstack/react-query';
import type { ConflictFileDetails, ConflictItem } from '@worklens/contracts';
import { ArrowDown, Check, CheckCheck, GitMerge, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { detectLanguage, tokenClass, tokenizeLine } from '../code-editor/syntax-highlighter';
import { ErrorNotice, Loading } from '../common';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export function MergeConflictView({ onResolved }: { onResolved?: (path: string) => void }) {
  const { repo } = useSession();
  const git = useGit();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [outputContent, setOutputContent] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const conflictsQuery = useQuery({
    queryKey: ['conflict_list', repo?.path],
    queryFn: () => query<ConflictItem[]>('conflict_list', repo?.path),
    enabled: Boolean(repo),
  });

  const conflicts = conflictsQuery.data ?? [];

  useEffect(() => {
    if (conflicts.length > 0 && (!selectedFile || !conflicts.some((c) => c.path === selectedFile))) {
      setSelectedFile(conflicts[0].path);
    }
  }, [conflicts, selectedFile]);

  const detailsQuery = useQuery({
    queryKey: ['conflict_details', repo?.path, selectedFile],
    queryFn: () => query<ConflictFileDetails>('conflict_details', repo?.path, { path: selectedFile ?? '' }),
    enabled: Boolean(repo && selectedFile),
  });

  useEffect(() => {
    if (detailsQuery.data) {
      setOutputContent(detailsQuery.data.fullContent);
      setStatusMsg(null);
    }
  }, [detailsQuery.data]);

  const hunks = detailsQuery.data?.hunks ?? [];
  const lang = detectLanguage(selectedFile ?? '');

  function replaceHunkInOutput(hunkId: string, replacement: string) {
    if (!detailsQuery.data) return;
    const hunk = hunks.find((h) => h.id === hunkId);
    if (!hunk) return;

    // Build the conflict block string pattern to replace in output
    const regex = /<{7}[^\n]*\n[\s\S]*?={7}[\s\S]*?>{7}[^\n]*\n?/m;
    setOutputContent((prev) => prev.replace(regex, replacement ? `${replacement}\n` : ''));
  }

  function acceptAllCurrent() {
    let text = detailsQuery.data?.fullContent ?? outputContent;
    for (const h of hunks) {
      const blockRegex = /<{7}[^\n]*\n[\s\S]*?={7}[\s\S]*?>{7}[^\n]*\n?/m;
      text = text.replace(blockRegex, h.currentContent ? `${h.currentContent}\n` : '');
    }
    setOutputContent(text);
  }

  function acceptAllIncoming() {
    let text = detailsQuery.data?.fullContent ?? outputContent;
    for (const h of hunks) {
      const blockRegex = /<{7}[^\n]*\n[\s\S]*?={7}[\s\S]*?>{7}[^\n]*\n?/m;
      text = text.replace(blockRegex, h.incomingContent ? `${h.incomingContent}\n` : '');
    }
    setOutputContent(text);
  }

  async function handleSaveResolution() {
    if (!repo || !selectedFile) return;
    setIsResolving(true);
    setStatusMsg(null);
    try {
      await query('resolve_conflict', repo.path, { path: selectedFile, content: outputContent });
      await Promise.all([conflictsQuery.refetch(), git.refetch()]);
      setStatusMsg('Marked resolved & staged in Git!');
      if (onResolved) onResolved(selectedFile);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsResolving(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-card border rounded-xl overflow-hidden font-mono text-xs">
      {/* Top Bar: Conflicts Selector */}
      <header className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
        <div className="flex items-center gap-2">
          <GitMerge className="size-4 text-primary" />
          <span className="font-semibold text-foreground text-sm font-sans">3-Way Merge Tool</span>
          <Badge variant={conflicts.length > 0 ? 'destructive' : 'secondary'} className="text-[10px]">
            {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {conflicts.length > 0 && (
            <select
              value={selectedFile ?? ''}
              onChange={(e) => setSelectedFile(e.target.value)}
              className="bg-background border rounded px-2 py-1 text-xs outline-none"
            >
              {conflicts.map((c) => (
                <option key={c.path} value={c.path}>
                  {c.path} ({c.conflictCount} blocks)
                </option>
              ))}
            </select>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void conflictsQuery.refetch()}
          >
            <RefreshCw className="size-3 mr-1" />
            Refresh
          </Button>
        </div>
      </header>

      <ErrorNotice error={conflictsQuery.error || detailsQuery.error} />

      {conflicts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <CheckCheck className="size-12 mb-3 text-emerald-500 opacity-80" />
          <h3 className="text-sm font-semibold text-foreground mb-1">No Git merge conflicts</h3>
          <p className="text-xs max-w-sm mb-4">
            Your working tree is clean or conflicts have already been resolved and staged.
          </p>
        </div>
      ) : detailsQuery.isPending ? (
        <div className="flex-1 flex items-center justify-center">
          <Loading />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Top Half: 2-Pane Side-by-Side (Current vs Incoming) */}
          <div className="grid grid-cols-2 divide-x border-b h-1/2 min-h-0 overflow-hidden">
            {/* Volet 1: Branche courante (Current / Ours) */}
            <div className="flex flex-col min-h-0 overflow-hidden bg-blue-500/5">
              <div className="flex items-center justify-between px-3 py-1.5 bg-blue-500/10 border-b select-none">
                <span className="font-semibold text-blue-700 dark:text-blue-300">
                  Current (Ours / {hunks[0]?.currentName ?? 'HEAD'})
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[10px] px-1.5 border-blue-500/30 text-blue-700 dark:text-blue-300"
                  onClick={acceptAllCurrent}
                >
                  Accept All Current
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-2 space-y-3">
                {hunks.map((hunk) => (
                  <div key={hunk.id} className="border border-blue-500/30 rounded bg-background p-2">
                    <div className="flex items-center justify-between mb-1 pb-1 border-b text-[10px] text-muted-foreground">
                      <span>{hunk.id}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 text-[10px] px-1 text-blue-600 hover:bg-blue-500/10"
                        onClick={() => replaceHunkInOutput(hunk.id, hunk.currentContent)}
                      >
                        <ArrowDown className="size-2.5 mr-0.5" />
                        Accept Block
                      </Button>
                    </div>
                    <div className="space-y-0.5">
                      {hunk.currentContent.split('\n').map((line, lIdx) => (
                        <div
                          key={lIdx}
                          className="flex items-center gap-1.5 group hover:bg-blue-500/10 px-1 rounded"
                        >
                          <button
                            type="button"
                            title="Add line to output"
                            onClick={() => replaceHunkInOutput(hunk.id, line)}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-blue-500 font-bold px-1 rounded bg-blue-500/20"
                          >
                            +
                          </button>
                          <span className="flex-1 whitespace-pre leading-4">
                            {tokenizeLine(line, lang).map((tok, tIdx) => (
                              <span key={tIdx} className={tokenClass(tok.type)}>
                                {tok.text}
                              </span>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Volet 2: Branche entrante (Incoming / Theirs) */}
            <div className="flex flex-col min-h-0 overflow-hidden bg-purple-500/5">
              <div className="flex items-center justify-between px-3 py-1.5 bg-purple-500/10 border-b select-none">
                <span className="font-semibold text-purple-700 dark:text-purple-300">
                  Incoming (Theirs / {hunks[0]?.incomingName ?? 'Branch'})
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[10px] px-1.5 border-purple-500/30 text-purple-700 dark:text-purple-300"
                  onClick={acceptAllIncoming}
                >
                  Accept All Incoming
                </Button>
              </div>
              <div className="flex-1 overflow-auto p-2 space-y-3">
                {hunks.map((hunk) => (
                  <div key={hunk.id} className="border border-purple-500/30 rounded bg-background p-2">
                    <div className="flex items-center justify-between mb-1 pb-1 border-b text-[10px] text-muted-foreground">
                      <span>{hunk.id}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-4 text-[10px] px-1 text-purple-600 hover:bg-purple-500/10"
                        onClick={() => replaceHunkInOutput(hunk.id, hunk.incomingContent)}
                      >
                        <ArrowDown className="size-2.5 mr-0.5" />
                        Accept Block
                      </Button>
                    </div>
                    <div className="space-y-0.5">
                      {hunk.incomingContent.split('\n').map((line, lIdx) => (
                        <div
                          key={lIdx}
                          className="flex items-center gap-1.5 group hover:bg-purple-500/10 px-1 rounded"
                        >
                          <button
                            type="button"
                            title="Add line to output"
                            onClick={() => replaceHunkInOutput(hunk.id, line)}
                            className="opacity-0 group-hover:opacity-100 text-[10px] text-purple-500 font-bold px-1 rounded bg-purple-500/20"
                          >
                            +
                          </button>
                          <span className="flex-1 whitespace-pre leading-4">
                            {tokenizeLine(line, lang).map((tok, tIdx) => (
                              <span key={tIdx} className={tokenClass(tok.type)}>
                                {tok.text}
                              </span>
                            ))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Volet 3: Résultat final éditable en bas (Output) */}
          <div className="flex flex-col h-1/2 min-h-0 bg-background">
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b select-none">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Output (Merged Result)</span>
                <span className="text-[10px] text-muted-foreground">Directly editable below</span>
              </div>
              <div className="flex items-center gap-2">
                {statusMsg && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="size-3" />
                    {statusMsg}
                  </span>
                )}
                <Button
                  variant="default"
                  size="sm"
                  className="h-6 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={isResolving}
                  onClick={() => void handleSaveResolution()}
                >
                  <Save className="size-3 mr-1" />
                  {isResolving ? 'Resolving...' : 'Save & Mark Resolved'}
                </Button>
              </div>
            </div>
            <textarea
              value={outputContent}
              onChange={(e) => setOutputContent(e.target.value)}
              spellCheck={false}
              className="flex-1 p-3 bg-transparent resize-none outline-none leading-5 font-mono text-xs whitespace-pre overflow-auto"
              placeholder="Merge output will be saved here..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
