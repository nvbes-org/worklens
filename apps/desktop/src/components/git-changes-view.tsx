import type { FileChange } from '@worklens/contracts';
import { CircleAlert, Edit3, GitMerge, Minus, Plus, Trash2 } from 'lucide-react';
import type React from 'react';
import { query } from '../lib/api';
import { isConflict, isStaged, isUnstaged } from '../lib/git-status';
import { useGit, useSession } from '../lib/session';
import { GitCommitComposer } from './git-commit-composer';
import { type DiffSelection, GitDiff } from './git-diff';
import { Button } from './ui/button';

interface Props {
  selection: DiffSelection | null;
  onSelectChange: (change: FileChange, staged: boolean) => void;
  onOpenEditor?: (path: string) => void;
  onOpenMergeTool?: () => void;
}

export function GitChangesView({ selection, onSelectChange, onOpenEditor, onOpenMergeTool }: Props) {
  const { repo } = useSession();
  const git = useGit();
  const changes = git.data?.changes ?? [];
  const conflicts = changes.filter(isConflict);
  const stagedChanges = changes.filter(isStaged);

  const fileSelection =
    selection?.path && !changes.some((change) => change.path === selection.path) ? null : selection;

  async function stageFile(path: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!repo) return;
    await query('git_action', repo.path, { action: 'stage_file', path });
    await git.refetch();
  }

  async function unstageFile(path: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!repo) return;
    await query('git_action', repo.path, { action: 'unstage_file', path });
    await git.refetch();
  }

  async function discardFile(change: FileChange, e: React.MouseEvent) {
    e.stopPropagation();
    if (!repo) return;
    const isUntracked = change.indexStatus === '?' || change.worktreeStatus === '?';
    if (window.confirm(`Discard all changes in ${change.path}? This cannot be undone.`)) {
      await query('git_action', repo.path, {
        action: 'discard_file',
        path: change.path,
        untracked: isUntracked,
      });
      await git.refetch();
    }
  }

  return (
    <div>
      {conflicts.length > 0 && (
        <div className="conflict-banner flex items-center justify-between" role="status">
          <div className="flex items-center gap-2">
            <CircleAlert className="size-4 shrink-0 text-red-500" />
            <div>
              <strong>
                {conflicts.length} unresolved conflict{conflicts.length > 1 ? 's' : ''}
              </strong>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Resolve these files in the 3-Way Merge tool before committing.
              </p>
            </div>
          </div>
          {onOpenMergeTool && (
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
              onClick={onOpenMergeTool}
            >
              <GitMerge className="size-3.5 mr-1" />
              Open 3-Way Merge Tool
            </Button>
          )}
        </div>
      )}

      <div className="git-workspace">
        <section className="git-files" aria-label="Changed files">
          <div className="file-groups">
            {[
              { label: 'Conflicts', files: conflicts, staged: false },
              { label: 'Changes', files: changes.filter(isUnstaged), staged: false },
              { label: 'Staged', files: stagedChanges, staged: true },
            ].map(
              (group) =>
                group.files.length > 0 && (
                  <div key={group.label} className="file-group">
                    <h2 className="flex items-center justify-between pr-2">
                      <span>
                        {group.label}
                        <span className="ml-1.5">{group.files.length}</span>
                      </span>
                    </h2>
                    {group.files.map((change) => {
                      const isSelected =
                        fileSelection?.path === change.path && Boolean(fileSelection.staged) === group.staged;
                      return (
                        <div
                          key={change.path}
                          className={`file-row group flex items-center justify-between ${
                            isSelected ? 'selected' : ''
                          }`}
                        >
                          <button
                            type="button"
                            className="flex items-center gap-2 min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer"
                            onClick={() => onSelectChange(change, group.staged)}
                            aria-pressed={isSelected}
                          >
                            <span className={`file-status ${isConflict(change) ? 'conflicted' : ''}`}>
                              {isConflict(change)
                                ? 'U'
                                : group.staged
                                  ? change.indexStatus
                                  : change.worktreeStatus}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs">{change.path.split('/').pop()}</span>
                              <span
                                className="mt-0.5 block truncate text-[10px] text-muted-foreground"
                                title={change.path}
                              >
                                {change.path}
                              </span>
                            </span>
                          </button>

                          {/* Action Buttons: Edit / Stage / Unstage / Discard */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {onOpenEditor && (
                              <button
                                type="button"
                                title="Edit file in in-app editor"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenEditor(change.path);
                                }}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                              >
                                <Edit3 className="size-3" />
                              </button>
                            )}
                            {group.staged ? (
                              <button
                                type="button"
                                title="Unstage file"
                                onClick={(e) => void unstageFile(change.path, e)}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                              >
                                <Minus className="size-3" />
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  title="Stage file"
                                  onClick={(e) => void stageFile(change.path, e)}
                                  className="p-1 rounded text-primary hover:bg-primary/10"
                                >
                                  <Plus className="size-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Discard changes"
                                  onClick={(e) => void discardFile(change, e)}
                                  className="p-1 rounded text-red-500 hover:bg-red-500/10"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ),
            )}
            {changes.length === 0 && (
              <div className="p-5 text-sm text-muted-foreground">Your working tree is clean.</div>
            )}
          </div>

          {/* Granular Conventional Commit Composer */}
          <GitCommitComposer stagedChanges={stagedChanges} />
        </section>

        <GitDiff selection={fileSelection} onOpenEditor={onOpenEditor} />
      </div>
    </div>
  );
}
