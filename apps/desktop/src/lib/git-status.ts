import type { FileChange } from '@worklens/contracts';

export function isConflict(change: FileChange) {
  return ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(change.indexStatus + change.worktreeStatus);
}
export function isStaged(change: FileChange) {
  return !isConflict(change) && ![' ', '?'].includes(change.indexStatus);
}
export function isUnstaged(change: FileChange) {
  return !isConflict(change) && change.worktreeStatus !== ' ';
}
