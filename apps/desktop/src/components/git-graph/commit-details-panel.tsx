import { useQuery } from '@tanstack/react-query';
import type { Commit } from '@worklens/contracts';
import { Copy, FileCode2, GitCommitHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Button } from '../ui/button';
import { getInitials, stringToColor } from './git-graph-layout';

interface Props {
  commit: Commit | null;
  onClose: () => void;
  onSelectFile?: (path: string) => void;
  onSelectSha?: (sha: string) => void;
}

export function CommitDetailsPanel({ commit, onClose, onSelectFile, onSelectSha }: Props) {
  const { repo } = useSession();
  const [copied, setCopied] = useState(false);

  const filesQuery = useQuery({
    queryKey: ['commit_files', repo?.path, commit?.sha],
    queryFn: () => query<string[]>('commit_files', repo?.path, { sha: commit?.sha ?? '' }),
    enabled: Boolean(repo && commit?.sha),
  });

  if (!commit) return null;

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const authorColor = stringToColor(commit.author || 'User');
  const initials = getInitials(commit.author || 'User');
  const files = filesQuery.data ?? [];

  return (
    <div className="flex flex-col h-full border rounded-xl bg-card overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <GitCommitHorizontal className="size-4 text-primary shrink-0" />
          <span className="font-semibold text-foreground truncate">Commit Details</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        {/* Subject & Body */}
        <div>
          <h3 className="text-sm font-semibold text-foreground leading-snug">{commit.subject}</h3>
          {commit.body && (
            <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-mono p-2.5 rounded-lg bg-muted/40 border">
              {commit.body}
            </div>
          )}
        </div>

        {/* Author info */}
        <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/20">
          <div
            className="size-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
            style={{ backgroundColor: authorColor }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground truncate">{commit.author}</div>
            <div className="text-[10px] text-muted-foreground truncate">{commit.authorEmail}</div>
          </div>
          <time className="text-[10px] text-muted-foreground shrink-0">
            {new Date(commit.date).toLocaleString()}
          </time>
        </div>

        {/* SHA & Parents */}
        <div className="space-y-1.5 font-mono text-[11px]">
          <div className="flex items-center justify-between gap-2 p-1.5 rounded border bg-background">
            <span className="text-muted-foreground">SHA:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-foreground">{copied ? 'Copied!' : commit.sha.slice(0, 10)}</span>
              <button
                type="button"
                onClick={() => copy(commit.sha)}
                className="hover:text-primary p-0.5"
                title="Copy full SHA"
              >
                <Copy className="size-3" />
              </button>
            </div>
          </div>

          {commit.parents.length > 0 && (
            <div className="p-1.5 rounded border bg-background flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Parent{commit.parents.length > 1 ? 's' : ''}:</span>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {commit.parents.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onSelectSha?.(p)}
                    className="text-primary hover:underline"
                    title={`Jump to parent ${p}`}
                  >
                    {p.slice(0, 7)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Touched Files */}
        <div>
          <h4 className="text-[11px] font-semibold text-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Files Changed ({files.length})</span>
            {filesQuery.isPending && (
              <span className="text-[10px] text-muted-foreground font-normal">Loading…</span>
            )}
          </h4>
          <div className="divide-y divide-border/50 border rounded-lg overflow-hidden bg-background max-h-48 overflow-y-auto font-mono text-[11px]">
            {files.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => onSelectFile?.(file)}
                className="w-full text-left p-2 hover:bg-muted/60 flex items-center gap-2 group transition-colors"
              >
                <FileCode2 className="size-3 text-muted-foreground group-hover:text-primary shrink-0" />
                <span className="truncate flex-1" title={file}>
                  {file}
                </span>
              </button>
            ))}
            {files.length === 0 && !filesQuery.isPending && (
              <div className="p-3 text-center text-muted-foreground text-xs font-sans">
                No files recorded for this commit.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
