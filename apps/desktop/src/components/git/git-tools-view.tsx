import {
  Archive,
  FolderSync,
  GitCommitHorizontal,
  HardDrive,
  KeyRound,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { GitGithubGovernance } from './git-github-governance';
import { GitLfs } from './git-lfs';
import { GitRebase } from './git-rebase';
import { GitSigning } from './git-signing';
import { GitStash } from './git-stash';
import { GitSubmodules } from './git-submodules';
import { GitWorktrees } from './git-worktrees';

type ToolTab = 'rebase' | 'stash' | 'worktrees' | 'lfs' | 'submodules' | 'signing' | 'github_ext';

interface ToolItem {
  id: ToolTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const TOOLS: ToolItem[] = [
  {
    id: 'rebase',
    label: 'Interactive Rebase',
    icon: GitCommitHorizontal,
    description: 'Squash, reorder, and edit commits',
  },
  { id: 'stash', label: 'Stashes', icon: Archive, description: 'Manage saved dirty working states' },
  {
    id: 'worktrees',
    label: 'Worktrees',
    icon: Layers,
    description: 'Parallel workspaces from the same repository',
  },
  { id: 'lfs', label: 'Git LFS', icon: HardDrive, description: 'Track large files and lock binary assets' },
  {
    id: 'submodules',
    label: 'Submodules',
    icon: FolderSync,
    description: 'Nested repositories sync and status',
  },
  {
    id: 'signing',
    label: 'Signatures & SSH',
    icon: KeyRound,
    description: 'GPG & SSH commit signing configurations',
  },
  {
    id: 'github_ext',
    label: 'GitHub & CI',
    icon: ShieldCheck,
    description: 'Boundary checks, Check Runs and CI dispatch',
  },
];

export function GitToolsView() {
  const [activeTool, setActiveTool] = useState<ToolTab>('rebase');

  return (
    <div className="flex flex-col flex-1 min-h-[580px] border rounded-xl overflow-hidden bg-background">
      {/* Tools Ribbon Header */}
      <div className="flex items-center gap-1 p-2 border-b bg-muted/40 overflow-x-auto select-none">
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-foreground mr-2 shrink-0">
          <Sparkles className="size-3.5 text-primary" />
          <span>Advanced Git Studio</span>
        </div>
        <div className="flex items-center gap-1">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isSelected = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-card text-foreground shadow-xs border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                <Icon className={`size-3.5 ${isSelected ? 'text-primary' : ''}`} />
                <span>{tool.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tool Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {activeTool === 'rebase' && <GitRebase />}
        {activeTool === 'stash' && <GitStash />}
        {activeTool === 'worktrees' && <GitWorktrees />}
        {activeTool === 'lfs' && <GitLfs />}
        {activeTool === 'submodules' && <GitSubmodules />}
        {activeTool === 'signing' && <GitSigning />}
        {activeTool === 'github_ext' && <GitGithubGovernance />}
      </div>
    </div>
  );
}
