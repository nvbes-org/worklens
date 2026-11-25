import type { FileChange } from '@worklens/contracts';
import { GitCommitHorizontal, Loader2, Sparkles } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { query } from '../lib/api';
import { useGit, useSession } from '../lib/session';
import { Button } from './ui/button';

const CONVENTIONAL_TYPES = [
  { type: 'feat', label: 'feat: A new feature' },
  { type: 'fix', label: 'fix: A bug fix' },
  { type: 'docs', label: 'docs: Documentation changes' },
  { type: 'style', label: 'style: Code style or formatting' },
  { type: 'refactor', label: 'refactor: Refactoring code' },
  { type: 'perf', label: 'perf: Performance improvements' },
  { type: 'test', label: 'test: Adding or fixing tests' },
  { type: 'chore', label: 'chore: Build, tools or maintenance' },
  { type: 'revert', label: 'revert: Reverting changes' },
];

interface Props {
  stagedChanges: FileChange[];
  onCommitted?: () => void;
}

export function GitCommitComposer({ stagedChanges, onCommitted }: Props) {
  const { repo } = useSession();
  const git = useGit();
  const [useConventional, setUseConventional] = useState(true);
  const [convType, setConvType] = useState('feat');
  const [scope, setScope] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [amend, setAmend] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When amend is checked, prefill with last commit message
  useEffect(() => {
    if (amend && git.data?.commits && git.data.commits.length > 0) {
      const last = git.data.commits[0];
      const match = /^([a-z]+)(?:\(([^)]+)\))?:\s*(.*)$/.exec(last.subject);
      if (match) {
        setUseConventional(true);
        setConvType(match[1]);
        setScope(match[2] ?? '');
        setSubject(match[3] ?? '');
      } else {
        setUseConventional(false);
        setSubject(last.subject);
      }
      setBody(last.body || '');
    }
  }, [amend, git.data?.commits]);

  const fullSubject = useConventional
    ? `${convType}${scope.trim() ? `(${scope.trim()})` : ''}: ${subject.trim()}`
    : subject.trim();

  const fullMessage = body.trim() ? `${fullSubject}\n\n${body.trim()}` : fullSubject;

  const canCommit = (stagedChanges.length > 0 || amend) && fullSubject.length > 0;

  async function handleCommit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!canCommit || !repo) return;
    setLoading(true);
    setError(null);
    try {
      await query('git_action', repo.path, {
        action: 'commit',
        message: fullMessage,
        amend,
      });
      setSubject('');
      setBody('');
      setScope('');
      setAmend(false);
      await git.refetch();
      onCommitted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function stageAll() {
    if (!repo) return;
    setLoading(true);
    try {
      await query('git_action', repo.path, { action: 'stage_all' });
      await git.refetch();
    } finally {
      setLoading(false);
    }
  }

  async function unstageAll() {
    if (!repo) return;
    setLoading(true);
    try {
      await query('git_action', repo.path, { action: 'unstage_all' });
      await git.refetch();
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleCommit();
    }
  }

  return (
    <form
      onSubmit={handleCommit}
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-2.5 p-3 border-t bg-muted/20 text-xs"
    >
      {/* Staging actions & format toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={stageAll}
            disabled={loading}
            className="h-6 text-[10px] px-2 text-primary hover:bg-primary/10"
          >
            Stage All
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={unstageAll}
            disabled={loading || stagedChanges.length === 0}
            className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
          >
            Unstage All
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setUseConventional(!useConventional)}
          className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1"
        >
          <Sparkles className="size-2.5" />
          <span>{useConventional ? 'Conventional Commits' : 'Freeform'}</span>
        </button>
      </div>

      {error && (
        <div className="p-2 rounded bg-destructive/10 text-destructive text-[11px] border border-destructive/20">
          {error}
        </div>
      )}

      {/* Conventional commit inputs */}
      {useConventional ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <select
              value={convType}
              onChange={(e) => setConvType(e.target.value)}
              className="h-7 text-xs rounded border bg-background px-2 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary w-28 shrink-0"
            >
              {CONVENTIONAL_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.type}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="scope (opt.)"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="h-7 text-xs rounded border bg-background px-2 text-foreground w-24 shrink-0 focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              placeholder="Summary message…"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-7 text-xs rounded border bg-background px-2 text-foreground flex-1 min-w-0 focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>
          {subject && (
            <div className="text-[10px] font-mono text-muted-foreground px-1 truncate">
              Preview: <span className="text-primary font-medium">{fullSubject}</span>
            </div>
          )}
        </div>
      ) : (
        <input
          type="text"
          placeholder="Commit summary message…"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-7 text-xs rounded border bg-background px-2 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
      )}

      {/* Extended description / body */}
      <textarea
        rows={2}
        placeholder="Extended description (optional)…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="text-xs rounded border bg-background p-2 text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary resize-y font-mono"
      />

      {/* Footer: Amend & Commit button */}
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => setAmend(e.target.checked)}
            className="rounded border-border text-primary size-3.5 focus:ring-primary"
          />
          <span>Amend last commit</span>
        </label>

        <Button type="submit" size="sm" disabled={!canCommit || loading} className="h-7 text-xs px-3 gap-1.5">
          {loading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <GitCommitHorizontal className="size-3.5" />
          )}
          <span>
            {amend
              ? 'Amend Commit'
              : stagedChanges.length > 0
                ? `Commit (${stagedChanges.length} staged)`
                : 'Commit'}
          </span>
        </Button>
      </div>
    </form>
  );
}
