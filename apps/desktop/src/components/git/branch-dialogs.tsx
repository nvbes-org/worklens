import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

interface CreateBranchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (name: string) => void;
}

export function CreateBranchDialog({ isOpen, onClose, onCreated }: CreateBranchDialogProps) {
  const { repo } = useSession();
  const git = useGit();
  const [name, setName] = useState('');
  const [startPoint, setStartPoint] = useState('');
  const [checkout, setCheckout] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!repo || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await query('git_action', repo.path, {
        action: 'branch_create',
        name: name.trim(),
        start_point: startPoint.trim() || null,
        checkout,
      });
      await git.refetch();
      onCreated?.(name.trim());
      onClose();
      setName('');
      setStartPoint('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl animate-in zoom-in-95">
        <h3 className="text-base font-semibold text-foreground">Create New Branch</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Create a new branch from current HEAD or a specific commit.
        </p>

        {error && (
          <div className="mt-3 p-2.5 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="mt-4 space-y-3.5">
          <div>
            <label htmlFor="branch-name-input" className="block text-xs font-medium text-foreground mb-1">
              Branch Name
            </label>
            <input
              id="branch-name-input"
              type="text"
              required
              placeholder="e.g. feature/awesome-ui"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md border bg-background text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label htmlFor="start-point-input" className="block text-xs font-medium text-foreground mb-1">
              Starting Point{' '}
              <span className="text-muted-foreground font-normal">(optional, default HEAD)</span>
            </label>
            <input
              id="start-point-input"
              type="text"
              placeholder="HEAD, commit SHA, or branch name"
              value={startPoint}
              onChange={(e) => setStartPoint(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md border bg-background text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={checkout}
              onChange={(e) => setCheckout(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary/40"
            />
            <span>Checkout new branch immediately</span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="default" size="sm" disabled={loading || !name.trim()}>
              {loading ? 'Creating...' : 'Create Branch'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CreateTagDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (name: string) => void;
}

export function CreateTagDialog({ isOpen, onClose, onCreated }: CreateTagDialogProps) {
  const { repo } = useSession();
  const git = useGit();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!repo || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await query('git_action', repo.path, {
        action: 'tag_create',
        name: name.trim(),
        message: message.trim() || null,
        target: target.trim() || null,
      });
      await git.refetch();
      onCreated?.(name.trim());
      onClose();
      setName('');
      setMessage('');
      setTarget('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl animate-in zoom-in-95">
        <h3 className="text-base font-semibold text-foreground">Create Git Tag</h3>
        <p className="mt-1 text-xs text-muted-foreground">Create a lightweight or annotated release tag.</p>

        {error && (
          <div className="mt-3 p-2.5 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleCreate} className="mt-4 space-y-3.5">
          <div>
            <label htmlFor="tag-name-input" className="block text-xs font-medium text-foreground mb-1">
              Tag Name
            </label>
            <input
              id="tag-name-input"
              type="text"
              required
              placeholder="e.g. v1.2.0"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md border bg-background text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label htmlFor="tag-target-input" className="block text-xs font-medium text-foreground mb-1">
              Target <span className="text-muted-foreground font-normal">(optional, default HEAD)</span>
            </label>
            <input
              id="tag-target-input"
              type="text"
              placeholder="HEAD or commit SHA"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md border bg-background text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div>
            <label htmlFor="tag-message-input" className="block text-xs font-medium text-foreground mb-1">
              Annotation Message <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="tag-message-input"
              rows={2}
              placeholder="Release message (creates annotated tag)..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md border bg-background text-xs resize-none focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="default" size="sm" disabled={loading || !name.trim()}>
              {loading ? 'Creating...' : 'Create Tag'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface StashSaveDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StashSaveDialog({ isOpen, onClose }: StashSaveDialogProps) {
  const { repo } = useSession();
  const git = useGit();
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!repo) return;
    setLoading(true);
    setError(null);
    try {
      await query('git_action', repo.path, {
        action: 'stash_create',
        message: message.trim() || null,
        include_untracked: includeUntracked,
      });
      await git.refetch();
      onClose();
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl animate-in zoom-in-95">
        <h3 className="text-base font-semibold text-foreground">Save Changes to Stash</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Shelve your current dirty working directory changes for later.
        </p>

        {error && (
          <div className="mt-3 p-2.5 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-3.5">
          <div>
            <label htmlFor="stash-msg-input" className="block text-xs font-medium text-foreground mb-1">
              Stash Message <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              id="stash-msg-input"
              type="text"
              placeholder="e.g. WIP on user authentication"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md border bg-background text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(e) => setIncludeUntracked(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary/40"
            />
            <span>Include untracked files (`-u`)</span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" variant="default" size="sm" disabled={loading}>
              {loading ? 'Saving...' : 'Save Stash'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
