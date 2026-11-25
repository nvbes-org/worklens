import { useQuery } from '@tanstack/react-query';
import type { FileChange, GitSnapshot } from '@worklens/contracts';
import { GitBranch, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { CodeEditor } from '../components/code-editor/code-editor';
import { Empty, ErrorNotice, Loading, Source } from '../components/common';
import { CreateBranchDialog, CreateTagDialog, StashSaveDialog } from '../components/git/branch-dialogs';
import { GitControlBar } from '../components/git/git-control-bar';
import { GitHistoryView } from '../components/git/git-history-view';
import { GitLfs } from '../components/git/git-lfs';
import { GitRebase } from '../components/git/git-rebase';
import { GitSidebar } from '../components/git/git-sidebar';
import { GitSigning } from '../components/git/git-signing';
import { GitStash } from '../components/git/git-stash';
import { GitSubmodules } from '../components/git/git-submodules';
import { GitTerminalDrawer } from '../components/git/git-terminal-drawer';
import { GitToolsView } from '../components/git/git-tools-view';
import { GitWorktrees } from '../components/git/git-worktrees';
import { GitChangesView } from '../components/git-changes-view';
import type { DiffSelection } from '../components/git-diff';
import { GitGithubGovernance } from '../components/git/git-github-governance';
import { GitGraphView } from '../components/git-graph-view';
import { MergeConflictView } from '../components/merge-tool/merge-conflict-view';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ViewHeading } from '../components/view-heading';
import { query } from '../lib/api';
import { isConflict } from '../lib/git-status';
import { useGit, useSession } from '../lib/session';

export function GitPage() {
  const { repo, isWatching, lastChange } = useSession();
  const git = useGit();
  const [tab, setTab] = useState('changes');
  const [selection, setSelection] = useState<DiffSelection | null>(null);
  const [offset, setOffset] = useState(0);
  const [editorPath, setEditorPath] = useState<string | null>(null);

  // Studio UI state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [showStashDialog, setShowStashDialog] = useState(false);

  const history = useQuery({
    queryKey: ['history', repo?.path, offset],
    queryFn: () => query<GitSnapshot>('git', repo?.path, { offset }),
    enabled: Boolean(repo) && tab === 'history',
  });

  const changes = git.data?.changes ?? [];
  const conflicts = changes.filter(isConflict);
  const active = git.data?.branches.find((branch) => branch.name === git.data?.branch);

  function selectFile(change: FileChange, staged: boolean) {
    setSelection({ path: change.path, staged, untracked: change.indexStatus === '?' });
  }

  function openEditorForPath(path: string) {
    setEditorPath(path);
    setTab('editor');
  }

  return (
    <>
      <ViewHeading
        section="Git"
        title="Your working tree"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <GitBranch className="size-3.5" />
            {git.data?.branch ?? 'Detached HEAD'}
            <span className="text-border">/</span>
            {active?.upstream ?? 'No upstream'} {active?.tracking}
          </span>
        }
      >
        <div className="flex items-center gap-2.5">
          {isWatching && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              title={
                lastChange
                  ? `Dernier changement : [${lastChange.kind}] ${lastChange.relativePath}`
                  : 'Live file watcher actif'
              }
            >
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live tracking
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => void git.refetch()} disabled={git.isFetching}>
            <RefreshCw className={`size-3.5 ${git.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </ViewHeading>

      <ErrorNotice error={git.error} />
      {git.isPending && <Loading />}

      {/* Modern Desktop Git Control Bar Ribbon */}
      <GitControlBar
        activeView={tab}
        onSelectView={(v) => {
          setTab(v);
          setSelection(null);
        }}
        changesCount={changes.length}
        conflictsCount={conflicts.length}
        onOpenNewBranch={() => setShowBranchDialog(true)}
        onOpenNewTag={() => setShowTagDialog(true)}
        onOpenStashSave={() => setShowStashDialog(true)}
        onToggleTerminal={() => setIsTerminalOpen(!isTerminalOpen)}
        isTerminalOpen={isTerminalOpen}
      />

      {/* Main Git Studio Workspace (Sidebar + Center Content) */}
      <div className="flex flex-1 min-h-[560px] gap-3">
        {/* Persistent Collapsible Repository Navigator */}
        <GitSidebar
          activeView={tab}
          onSelectView={(v) => {
            setTab(v);
            setSelection(null);
          }}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenNewBranch={() => setShowBranchDialog(true)}
          onOpenNewTag={() => setShowTagDialog(true)}
        />

        {/* Central Studio Content Area */}
        <div className="flex-1 min-w-0">
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              setSelection(null);
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3 overflow-x-auto pb-1">
              <TabsList variant="segmented" aria-label="Git views" className="flex-wrap h-auto gap-1">
                <TabsTrigger value="changes">
                  Changes <span className="tab-count">{changes.length}</span>
                </TabsTrigger>
                <TabsTrigger value="graph">Graph</TabsTrigger>
                <TabsTrigger value="merge">
                  3-Way Merge
                  {conflicts.length > 0 && (
                    <span className="tab-count bg-red-500 text-white ml-1.5">{conflicts.length}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="editor">Editor</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="rebase">Rebase</TabsTrigger>
                <TabsTrigger value="stash">Stash</TabsTrigger>
                <TabsTrigger value="worktrees">Worktrees</TabsTrigger>
                <TabsTrigger value="lfs">Git LFS</TabsTrigger>
                <TabsTrigger value="submodules">Submodules</TabsTrigger>
                <TabsTrigger value="signing">Signatures &amp; SSH</TabsTrigger>
                <TabsTrigger value="github" className="font-semibold text-primary">
                  GitHub &amp; CI
                </TabsTrigger>
                <TabsTrigger value="branches">Branches</TabsTrigger>
              </TabsList>
            </div>

            {/* Tab: Changes with Granular Staging & Commit Composer */}
            <TabsContent value="changes">
              <GitChangesView
                selection={selection}
                onSelectChange={selectFile}
                onOpenEditor={openEditorForPath}
                onOpenMergeTool={() => setTab('merge')}
              />
            </TabsContent>

            {/* Tab: Interactive Real-time Git Graph */}
            <TabsContent value="graph">
              <GitGraphView />
            </TabsContent>

            {/* Tab: 3-Way Merge Conflict Resolution */}
            <TabsContent value="merge">
              <MergeConflictView onResolved={() => void git.refetch()} />
            </TabsContent>

            {/* Tab: In-App Code Editor */}
            <TabsContent value="editor">
              <div className="h-[620px]">
                <CodeEditor
                  initialPath={editorPath ?? undefined}
                  onViewDiff={(p) => {
                    setSelection({ path: p });
                    setTab('changes');
                  }}
                  onClose={() => setTab('changes')}
                />
              </div>
            </TabsContent>

            {/* Tab: Commit History List */}
            <TabsContent value="history">
              <GitHistoryView
                historyData={history.data}
                isPending={history.isPending}
                error={history.error}
                offset={offset}
                onOffsetChange={setOffset}
                selection={selection}
                onSelectChange={setSelection}
                onOpenEditor={openEditorForPath}
                onNavigateToRebase={() => setTab('rebase')}
              />
            </TabsContent>

            {/* Tab: Interactive Rebase */}
            <TabsContent value="rebase">
              <GitRebase />
            </TabsContent>

            {/* Tab: Stash Management */}
            <TabsContent value="stash">
              <GitStash />
            </TabsContent>

            {/* Tab: Git Worktrees */}
            <TabsContent value="worktrees">
              <GitWorktrees />
            </TabsContent>

            {/* Tab: Git LFS */}
            <TabsContent value="lfs">
              <GitLfs />
            </TabsContent>

            {/* Tab: Submodules */}
            <TabsContent value="submodules">
              <GitSubmodules />
            </TabsContent>

            {/* Tab: Signatures & SSH Keys */}
            <TabsContent value="signing">
              <GitSigning />
            </TabsContent>

            {/* Tab: Branches */}
            <TabsContent value="branches">
              <div className="divide-y rounded-xl border">
                {git.data?.branches.map((branch) => (
                  <div key={branch.name} className="flex items-center gap-3 p-4 text-sm">
                    <GitBranch className="size-4 text-muted-foreground" />
                    <span className="flex-1 font-mono text-xs">{branch.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {branch.upstream ?? 'No upstream'} {branch.tracking}
                    </span>
                  </div>
                ))}
              </div>
              {git.data?.branches.length === 0 && (
                <Empty title="No branches yet">Create your first commit in Git.</Empty>
              )}
            </TabsContent>

            {/* Tab: GitHub Governance & CI */}
            <TabsContent value="github">
              <GitGithubGovernance />
            </TabsContent>

            {/* Tab: Git Studio Tools */}
            <TabsContent value="tools">
              <GitToolsView />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Interactive Git Terminal Drawer */}
      <GitTerminalDrawer
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        onToggle={() => setIsTerminalOpen(!isTerminalOpen)}
      />

      {/* Dialogs */}
      <CreateBranchDialog isOpen={showBranchDialog} onClose={() => setShowBranchDialog(false)} />
      <CreateTagDialog isOpen={showTagDialog} onClose={() => setShowTagDialog(false)} />
      <StashSaveDialog isOpen={showStashDialog} onClose={() => setShowStashDialog(false)} />

      {git.data && (
        <footer className="mt-5">
          <Source source={git.data.provenance} />
          <p className="mt-2 text-[10px] text-muted-foreground">
            Remote references are last known. No fetch is performed.
          </p>
        </footer>
      )}
    </>
  );
}
