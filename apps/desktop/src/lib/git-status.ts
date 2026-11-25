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

export function diffStats(text: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of text.split('\n')) {
    if (/^(diff |index |--- |\+\+\+ |\\|new file |deleted file |rename |similarity |@@ )/.test(line)) {
      continue;
    }
    if (line.startsWith('+')) additions++;
    else if (line.startsWith('-')) deletions++;
  }
  return { additions, deletions };
}
