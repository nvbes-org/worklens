import { useQuery } from '@tanstack/react-query';
import type { LargeFileCandidate, LfsStatus } from '@worklens/contracts';
import {
  CheckCircle2,
  Database,
  FileCheck,
  FileSearch,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

export function GitLfs() {
  const { repo } = useSession();
  const git = useGit();
  const [newPattern, setNewPattern] = useState('');
  const [lockPath, setLockPath] = useState('');
  const [thresholdMb, setThresholdMb] = useState(5);
  const [isScanning, setIsScanning] = useState(false);
  const [largeFiles, setLargeFiles] = useState<LargeFileCandidate[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const lfsStatusQuery = useQuery({
    queryKey: ['git_lfs_status', repo?.path],
    queryFn: () => query<LfsStatus>('git_action', repo?.path, { action: 'lfs_status' }),
    enabled: Boolean(repo),
  });

  const lfs = lfsStatusQuery.data;

  async function handleScanLargeFiles() {
    if (!repo) return;
    setIsScanning(true);
    setFeedback(null);
    try {
      const candidates = await query<LargeFileCandidate[]>('git_action', repo.path, {
        action: 'lfs_scan_large_files',
        threshold_mb: thresholdMb,
      });
      setLargeFiles(candidates);
      if (candidates.length === 0) {
        setFeedback(`No untracked files larger than ${thresholdMb} MB detected.`);
      }
    } catch (e) {
      setFeedback(`Error scanning: ${String(e)}`);
    } finally {
      setIsScanning(false);
    }
  }

  async function handleTrack(pattern: string) {
    if (!repo || !pattern.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await query('git_action', repo.path, {
        action: 'lfs_track',
        pattern: pattern.trim(),
      });
      setNewPattern('');
      setFeedback(`Tracked pattern "${pattern}" with Git LFS.`);
      await lfsStatusQuery.refetch();
      await git.refetch();
    } catch (e) {
      setFeedback(`Error tracking pattern: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUntrack(pattern: string) {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, {
        action: 'lfs_untrack',
        pattern,
      });
      setFeedback(`Untracked "${pattern}".`);
      await lfsStatusQuery.refetch();
    } catch (e) {
      setFeedback(`Error untracking: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLock(path: string) {
    if (!repo || !path.trim()) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'lfs_lock', path: path.trim() });
      setLockPath('');
      setFeedback(`Locked "${path}".`);
      await lfsStatusQuery.refetch();
    } catch (e) {
      setFeedback(`Error locking file: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUnlock(path: string) {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, { action: 'lfs_unlock', path, force: false });
      setFeedback(`Unlocked "${path}".`);
      await lfsStatusQuery.refetch();
    } catch (e) {
      setFeedback(`Error unlocking file: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <Database className="size-5 text-primary shrink-0" />
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Git LFS (Large File Storage)
              {lfs?.installed ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 border border-emerald-500/20">
                  Installed
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 border border-amber-500/20">
                  Not Installed
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              {lfs?.installed
                ? lfs.version
                : 'Git LFS command not found on PATH. Install git-lfs to enable binary tracking.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void lfsStatusQuery.refetch()}
            disabled={lfsStatusQuery.isFetching}
          >
            <RefreshCw className={`size-3.5 ${lfsStatusQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">{feedback}</div>
      )}

      {/* Auto-detect large files */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileSearch className="size-3.5 text-primary" />
              Automatic Large Binary File Detection
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Scan your repository for large binary files exceeding threshold.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">&gt;=</span>
            <input
              type="number"
              min={1}
              className="h-7 w-16 rounded border bg-background px-2 text-xs text-center"
              value={thresholdMb}
              onChange={(e) => setThresholdMb(Number(e.target.value))}
            />
            <span className="text-xs text-muted-foreground">MB</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleScanLargeFiles()}
              disabled={isScanning}
            >
              <Search className="mr-1.5 size-3.5" /> {isScanning ? 'Scanning...' : 'Scan Repository'}
            </Button>
          </div>
        </div>

        {largeFiles.length > 0 && (
          <div className="rounded-lg border divide-y overflow-hidden max-h-48 overflow-y-auto">
            {largeFiles.map((f) => (
              <div key={f.path} className="flex items-center justify-between p-2.5 text-xs hover:bg-muted/10">
                <div className="min-w-0 flex-1 pr-2">
                  <span className="font-mono text-xs">{f.path}</span>
                  <span className="ml-2 font-semibold text-muted-foreground">({f.formattedSize})</span>
                </div>
                {f.isLfsTracked ? (
                  <span className="text-emerald-600 text-[11px] font-medium flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Already LFS Tracked
                  </span>
                ) : (
                  <Button
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => void handleTrack(f.path)}
                    disabled={isSubmitting}
                  >
                    Track with LFS
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tracked patterns */}
        <div className="rounded-xl border p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tracked Patterns ({lfs?.patterns.length ?? 0})
          </h4>
          <div className="flex gap-2">
            <input
              type="text"
              className="h-8 flex-1 rounded-lg border bg-background px-3 text-xs font-mono"
              placeholder="*.psd, *.weights, *.bin..."
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => void handleTrack(newPattern)}
              disabled={isSubmitting || !newPattern.trim()}
            >
              <Plus className="size-3.5" /> Track
            </Button>
          </div>

          <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
            {lfs?.patterns.length === 0 ? (
              <p className="p-3 text-center text-xs text-muted-foreground">
                No patterns configured in .gitattributes
              </p>
            ) : (
              lfs?.patterns.map((p) => (
                <div key={p} className="flex items-center justify-between p-2 text-xs">
                  <span className="font-mono">{p}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-500"
                    onClick={() => void handleUntrack(p)}
                    disabled={isSubmitting}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Locks */}
        <div className="rounded-xl border p-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Lock className="size-3.5" /> File Locks ({lfs?.locks.length ?? 0})
          </h4>
          <div className="flex gap-2">
            <input
              type="text"
              className="h-8 flex-1 rounded-lg border bg-background px-3 text-xs font-mono"
              placeholder="path/to/binary.psd"
              value={lockPath}
              onChange={(e) => setLockPath(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleLock(lockPath)}
              disabled={isSubmitting || !lockPath.trim()}
            >
              <Lock className="size-3.5 mr-1" /> Lock
            </Button>
          </div>

          <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
            {lfs?.locks.length === 0 ? (
              <p className="p-3 text-center text-xs text-muted-foreground">No active file locks</p>
            ) : (
              lfs?.locks.map((lk) => (
                <div key={lk.id} className="flex items-center justify-between p-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-mono truncate">{lk.path}</p>
                    <p className="text-[10px] text-muted-foreground">Owner: {lk.owner}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => void handleUnlock(lk.path)}
                    disabled={isSubmitting}
                  >
                    <Unlock className="size-3 mr-1" /> Unlock
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tracked Files list */}
      <div className="rounded-xl border p-4 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FileCheck className="size-3.5" /> LFS Tracked Files ({lfs?.files.length ?? 0})
        </h4>
        <div className="rounded-lg border divide-y overflow-hidden max-h-56 overflow-y-auto">
          {lfs?.files.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No files currently tracked by Git LFS.
            </p>
          ) : (
            lfs?.files.map((file) => (
              <div
                key={file.path}
                className="flex items-center justify-between p-2.5 text-xs hover:bg-muted/10"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <p className="font-mono truncate">{file.path}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">OID: {file.oid.slice(0, 12)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-muted-foreground">{file.formattedSize}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px] px-2"
                    onClick={() => void handleLock(file.path)}
                    disabled={isSubmitting}
                  >
                    <Lock className="size-2.5 mr-1" /> Lock
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
