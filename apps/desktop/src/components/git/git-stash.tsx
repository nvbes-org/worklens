import { useQuery } from '@tanstack/react-query';
import type { StashEntry } from '@worklens/contracts';
import { Archive, Eye, FileCode, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

export function GitStash() {
  const { repo } = useSession();
  const git = useGit();
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [keepIndex, setKeepIndex] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSelector, setSelectedSelector] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const stashListQuery = useQuery({
    queryKey: ['git_stash_list', repo?.path],
    queryFn: () => query<StashEntry[]>('git_action', repo?.path, { action: 'stash_list' }),
    enabled: Boolean(repo),
  });

  const previewQuery = useQuery({
    queryKey: ['git_stash_preview', repo?.path, selectedSelector],
    queryFn: () =>
      selectedSelector
        ? query<{ selector: string; diff: string; files: string[] }>('git_action', repo?.path, {
            action: 'stash_show',
            selector: selectedSelector,
          })
        : null,
    enabled: Boolean(repo && selectedSelector),
  });

  const stashes = stashListQuery.data ?? [];

  async function handleCreateStash() {
    if (!repo) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await query('git_action', repo.path, {
        action: 'stash_create',
        message: message.trim() || null,
        include_untracked: includeUntracked,
        keep_index: keepIndex,
      });
      setMessage('');
      setFeedback('Stash created successfully.');
      await stashListQuery.refetch();
      await git.refetch();
    } catch (e) {
      setFeedback(`Error creating stash: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleApply(selector: string) {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'stash_apply', selector });
      setFeedback(`Applied ${selector}.`);
      await git.refetch();
    } catch (e) {
      setFeedback(`Error applying stash: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePop(selector: string) {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'stash_pop', selector });
      setFeedback(`Popped ${selector}.`);
      if (selectedSelector === selector) setSelectedSelector(null);
      await stashListQuery.refetch();
      await git.refetch();
    } catch (e) {
      setFeedback(`Error popping stash: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDrop(selector: string) {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'stash_drop', selector });
      setFeedback(`Dropped ${selector}.`);
      if (selectedSelector === selector) setSelectedSelector(null);
      await stashListQuery.refetch();
    } catch (e) {
      setFeedback(`Error dropping stash: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleClear() {
    if (!repo || !confirm('Are you sure you want to delete all stashes?')) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'stash_clear' });
      setSelectedSelector(null);
      setFeedback('All stashes cleared.');
      await stashListQuery.refetch();
    } catch (e) {
      setFeedback(`Error clearing stashes: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold mb-2">Create New Stash</h3>
        <div className="flex flex-col gap-3">
          <input
            type="text"
            className="h-8 w-full rounded-lg border bg-background px-3 text-xs"
            placeholder="Stash name / description (e.g. WIP on feature-x)..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeUntracked}
                  onChange={(e) => setIncludeUntracked(e.target.checked)}
                />
                Include untracked files
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={keepIndex} onChange={(e) => setKeepIndex(e.target.checked)} />
                Keep staged index
              </label>
            </div>
            <Button size="sm" onClick={() => void handleCreateStash()} disabled={isSubmitting}>
              <Plus className="mr-1.5 size-3.5" /> Save Stash
            </Button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">{feedback}</div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Saved Stashes ({stashes.length})
        </span>
        {stashes.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-rose-500"
            onClick={() => void handleClear()}
            disabled={isSubmitting}
          >
            <Trash2 className="mr-1.5 size-3" /> Clear All
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border divide-y overflow-hidden max-h-[500px] overflow-y-auto">
          {stashes.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No saved stashes. Use the form above to stash working changes.
            </div>
          ) : (
            stashes.map((s) => (
              <div
                key={s.selector}
                className={`p-3 text-xs flex flex-col gap-2 transition-colors ${
                  selectedSelector === s.selector
                    ? 'bg-primary/5 border-l-2 border-primary'
                    : 'hover:bg-muted/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium min-w-0">
                    <Archive className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-[11px] text-primary">{s.selector}</span>
                    <span className="truncate">{s.message || 'WIP on branch'}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(s.date).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-dashed">
                  <Button
                    size="sm"
                    variant={selectedSelector === s.selector ? 'secondary' : 'ghost'}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setSelectedSelector(selectedSelector === s.selector ? null : s.selector)}
                  >
                    <Eye className="mr-1 size-3" /> Preview
                  </Button>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => void handleApply(s.selector)}
                      disabled={isSubmitting}
                      title="Apply stash without removing it"
                    >
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => void handlePop(s.selector)}
                      disabled={isSubmitting}
                      title="Apply and delete stash"
                    >
                      Pop
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-rose-500 hover:text-rose-600"
                      onClick={() => void handleDrop(s.selector)}
                      disabled={isSubmitting}
                      title="Delete this stash"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-xl border p-4 min-h-[250px] flex flex-col">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <FileCode className="size-3.5" />
            {selectedSelector ? `Preview: ${selectedSelector}` : 'Stash Preview'}
          </h4>

          {selectedSelector && previewQuery.data ? (
            <div className="space-y-3 flex-1 overflow-auto">
              {previewQuery.data.files.length > 0 && (
                <div className="text-xs space-y-1">
                  <p className="font-medium text-muted-foreground">
                    Modified Files ({previewQuery.data.files.length}):
                  </p>
                  <ul className="list-disc list-inside font-mono text-[11px] text-muted-foreground">
                    {previewQuery.data.files.map((file) => (
                      <li key={file} className="truncate">
                        {file}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="font-mono text-[11px] whitespace-pre-wrap rounded-lg bg-muted/40 p-3 overflow-x-auto max-h-[350px]">
                {previewQuery.data.diff || 'No diff content.'}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              Select a stash on the left to preview its modified files and diff.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
