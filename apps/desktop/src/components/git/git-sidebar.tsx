import {
  AlertCircle,
  Archive,
  ChevronDown,
  ChevronRight,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { isConflict, isStaged, isUnstaged } from '../../lib/git-status';
import { useGit, useSession } from '../../lib/session';

interface Props {
  activeView: string;
  onSelectView: (view: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenNewBranch: () => void;
  onOpenNewTag: () => void;
}

export function GitSidebar({
  activeView,
  onSelectView,
  isCollapsed,
  onToggleCollapse,
  onOpenNewBranch,
  onOpenNewTag,
}: Props) {
  const { repo } = useSession();
  const git = useGit();
  const [search, setSearch] = useState('');
  const [openSections, setOpenSections] = useState({
    workingCopy: true,
    localBranches: true,
    remoteBranches: true,
    tags: true,
    worktrees: true,
  });

  const changes = git.data?.changes ?? [];
  const conflicts = changes.filter(isConflict);
  const unstaged = changes.filter(isUnstaged);
  const staged = changes.filter(isStaged);
  const currentBranch = git.data?.branch ?? null;
  const branches = git.data?.branches ?? [];
  const tags = git.data?.tags ?? [];
  const worktrees = git.data?.worktrees ?? [];

  const localBranches = branches.filter((b) => !b.name.includes('/'));
  const remoteBranches = branches.filter((b) => b.name.includes('/'));

  const q = search.toLowerCase().trim();
  const filteredLocal = q ? localBranches.filter((b) => b.name.toLowerCase().includes(q)) : localBranches;
  const filteredRemote = q ? remoteBranches.filter((b) => b.name.toLowerCase().includes(q)) : remoteBranches;
  const filteredTags = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;

  function toggleSection(sec: keyof typeof openSections) {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  }

  async function handleCheckout(name: string) {
    if (!repo) return;
    await query('git_action', repo.path, { action: 'checkout', branch: name });
    await git.refetch();
  }

  async function handleDeleteBranch(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!repo) return;
    if (window.confirm(`Delete branch "${name}"?`)) {
      await query('git_action', repo.path, { action: 'branch_delete', name });
      await git.refetch();
    }
  }

  async function handleDeleteTag(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!repo) return;
    if (window.confirm(`Delete tag "${name}"?`)) {
      await query('git_action', repo.path, { action: 'tag_delete', name });
      await git.refetch();
    }
  }

  if (isCollapsed) {
    return (
      <aside className="w-12 border-r bg-card/60 flex flex-col items-center py-3 gap-3 select-none">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expand Git Sidebar"
          className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onSelectView('changes')}
          title={`Changes (${changes.length})`}
          className={`relative p-2 rounded ${
            activeView === 'changes' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <FolderGit2 className="size-4" />
          {changes.length > 0 && (
            <span className="absolute -top-1 -right-1 px-1 min-w-[14px] text-[9px] font-bold rounded-full bg-primary text-primary-foreground text-center">
              {changes.length}
            </span>
          )}
        </button>
        {conflicts.length > 0 && (
          <button
            type="button"
            onClick={() => onSelectView('merge')}
            title={`3-Way Merge Conflicts (${conflicts.length})`}
            className="p-2 rounded bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/30"
          >
            <GitMerge className="size-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onSelectView('graph')}
          title="Commit Graph"
          className={`p-2 rounded ${
            activeView === 'graph' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <GitCommitHorizontal className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onSelectView('github')}
          title="GitHub & CI Governance"
          className={`p-2 rounded ${
            activeView === 'github' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <ShieldCheck className="size-4 text-emerald-500" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-64 border-r bg-card/50 flex flex-col select-none text-xs overflow-hidden">
      {/* Header & Filter */}
      <div className="p-2.5 border-b space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <FolderGit2 className="size-3.5 text-primary" /> Repository
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse Sidebar"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <ChevronDown className="size-3.5" />
          </button>
        </div>
        <div className="relative">
          <Search className="size-3 absolute left-2 top-2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter branches, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1 rounded bg-background border text-[11px] focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Working Copy Section */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('workingCopy')}
            className="flex items-center justify-between w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1.5 py-0.5 hover:text-foreground"
          >
            <span>Working Copy</span>
            {openSections.workingCopy ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </button>
          {openSections.workingCopy && (
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => onSelectView('changes')}
                className={`flex items-center justify-between w-full px-2 py-1.5 rounded transition-colors text-left ${
                  activeView === 'changes' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FolderGit2 className="size-3.5" />
                  <span>Changes</span>
                </div>
                <div className="flex items-center gap-1 text-[10px]">
                  {unstaged.length > 0 && (
                    <span className="text-amber-500 font-mono">+{unstaged.length}</span>
                  )}
                  {staged.length > 0 && <span className="text-emerald-500 font-mono">✓{staged.length}</span>}
                </div>
              </button>

              {conflicts.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectView('merge')}
                  className={`flex items-center justify-between w-full px-2 py-1.5 rounded transition-colors text-left ${
                    activeView === 'merge'
                      ? 'bg-red-500/20 text-red-600 dark:text-red-400 font-medium'
                      : 'text-red-500 hover:bg-red-500/10'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-3.5" />
                    <span>Conflicts</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white font-mono text-[9px] font-bold">
                    {conflicts.length}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onSelectView('github')}
                className={`flex items-center justify-between w-full px-2 py-1.5 rounded transition-colors text-left ${
                  activeView === 'github' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-3.5 text-emerald-500" />
                  <span>GitHub &amp; CI</span>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Local Branches Section */}
        <div>
          <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1.5">
            <button
              type="button"
              onClick={() => toggleSection('localBranches')}
              className="flex items-center gap-1 hover:text-foreground"
            >
              <span>Branches ({filteredLocal.length})</span>
              {openSections.localBranches ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>
            <button
              type="button"
              title="New branch"
              onClick={onOpenNewBranch}
              className="p-0.5 rounded hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3" />
            </button>
          </div>
          {openSections.localBranches && (
            <div className="space-y-0.5">
              {filteredLocal.map((b) => {
                const isCurrent = b.name === currentBranch;
                return (
                  <div
                    key={b.name}
                    className={`group flex items-center justify-between px-2 py-1 rounded transition-colors ${
                      isCurrent
                        ? 'bg-primary/15 text-primary font-medium'
                        : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleCheckout(b.name)}
                      className="flex items-center gap-2 truncate min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer"
                    >
                      <GitBranch className={`size-3.5 shrink-0 ${isCurrent ? 'text-primary' : ''}`} />
                      <span className="truncate">{b.name}</span>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      {b.tracking && (
                        <span className="text-[9px] font-mono opacity-60">
                          {b.tracking.replace('ahead ', '↑').replace('behind ', '↓')}
                        </span>
                      )}
                      {!isCurrent && (
                        <button
                          type="button"
                          title="Delete branch"
                          onClick={(e) => handleDeleteBranch(b.name, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 hover:bg-muted"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Remote Branches Section */}
        {filteredRemote.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => toggleSection('remoteBranches')}
              className="flex items-center justify-between w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1.5 py-0.5 hover:text-foreground"
            >
              <span>Remotes ({filteredRemote.length})</span>
              {openSections.remoteBranches ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>
            {openSections.remoteBranches && (
              <div className="space-y-0.5">
                {filteredRemote.map((b) => (
                  <button
                    type="button"
                    key={b.name}
                    className="flex items-center justify-between w-full px-2 py-1.5 rounded cursor-pointer hover:bg-muted/60 text-muted-foreground hover:text-foreground truncate text-left"
                    onClick={() => handleCheckout(b.name)}
                    title={`Checkout ${b.name}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Archive className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{b.name}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tags Section */}
        <div>
          <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1.5">
            <button
              type="button"
              onClick={() => toggleSection('tags')}
              className="flex items-center gap-1 hover:text-foreground"
            >
              <span>Tags ({filteredTags.length})</span>
              {openSections.tags ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            </button>
            <button
              type="button"
              title="New tag"
              onClick={onOpenNewTag}
              className="p-0.5 rounded hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3" />
            </button>
          </div>
          {openSections.tags && (
            <div className="space-y-0.5">
              {filteredTags.map((t) => (
                <div
                  key={t.name}
                  className="group flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                >
                  <div className="flex items-center gap-2 truncate">
                    <TagIcon className="size-3.5 shrink-0 text-amber-500" />
                    <span className="truncate font-mono">{t.name}</span>
                  </div>
                  <button
                    type="button"
                    title="Delete tag"
                    onClick={(e) => handleDeleteTag(t.name, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 hover:bg-muted"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Worktrees Section */}
        {worktrees.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => toggleSection('worktrees')}
              className="flex items-center justify-between w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1.5 py-0.5 hover:text-foreground"
            >
              <span>Worktrees ({worktrees.length})</span>
              {openSections.worktrees ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>
            {openSections.worktrees && (
              <div className="space-y-0.5">
                {worktrees.map((wt) => (
                  <button
                    type="button"
                    key={wt.id}
                    onClick={() => onSelectView('tools')}
                    className="flex items-center justify-between w-full px-2 py-1.5 rounded cursor-pointer hover:bg-muted/60 text-muted-foreground hover:text-foreground truncate text-left"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Layers className="size-3.5 shrink-0" />
                      <span className="truncate">{wt.branch ?? wt.path.split('/').pop()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
