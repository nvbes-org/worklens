import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MultiRepoWorkspace, Repository } from '@worklens/contracts';
import {
  Boxes,
  Edit2,
  FolderPlus,
  Layers,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { MultiRepoDashboard } from '../components/multi-repo/multi-repo-dashboard';
import { MultiRepoModal } from '../components/multi-repo/multi-repo-modal';
import { Button } from '../components/ui/button';
import { query } from '../lib/api';

export function WorkspacesPage() {
  const client = useQueryClient();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<MultiRepoWorkspace | null>(null);

  const workspacesQuery = useQuery({
    queryKey: ['multi_repo_workspaces'],
    queryFn: () => query<MultiRepoWorkspace[]>('multi_repo_list'),
  });

  const recent = useQuery({
    queryKey: ['recent'],
    queryFn: () => query<Repository[]>('recent'),
  });

  const saveMutation = useMutation({
    mutationFn: (ws: MultiRepoWorkspace) =>
      query<MultiRepoWorkspace>('multi_repo_save', null, { workspace: ws }),
    onSuccess: (saved) => {
      void client.invalidateQueries({ queryKey: ['multi_repo_workspaces'] });
      setSelectedWorkspaceId(saved.id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => query('multi_repo_delete', null, { id }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['multi_repo_workspaces'] });
      setSelectedWorkspaceId(null);
    },
  });

  const workspaces = workspacesQuery.data ?? [];
  const currentWorkspace =
    workspaces.find((ws) => ws.id === selectedWorkspaceId) ?? workspaces[0] ?? null;

  async function handleCreateFromRecent() {
    const recentRepos = recent.data ?? [];
    if (recentRepos.length === 0) {
      setEditingWorkspace(null);
      setModalOpen(true);
      return;
    }
    const newWs: MultiRepoWorkspace = {
      id: `ws-${Date.now()}`,
      name: 'My Workspace',
      description: 'Imported from recent repositories',
      repos: recentRepos.map((r) => ({
        id: `repo-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: r.name,
        path: r.path,
        remoteUrl: null,
        defaultBranch: 'main',
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveMutation.mutateAsync(newWs);
  }

  function handleDelete(ws: MultiRepoWorkspace) {
    if (confirm(`Are you sure you want to delete workspace "${ws.name}"?`)) {
      deleteMutation.mutate(ws.id);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Layers className="size-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Multi-Repo Workspaces</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Group dozens of repositories into a unified workspace. Inspect cross-repo branches, dirty states, and run batch actions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {workspaces.length > 0 && currentWorkspace && (
            <>
              {/* Workspace Selector */}
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Select Workspace"
                  value={currentWorkspace.id}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                  className="h-8 rounded-lg border bg-background px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name} ({ws.repos?.length ?? 0} repos)
                    </option>
                  ))}
                </select>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Edit Workspace"
                  onClick={() => {
                    setEditingWorkspace(currentWorkspace);
                    setModalOpen(true);
                  }}
                >
                  <Edit2 className="size-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="Delete Workspace"
                  onClick={() => handleDelete(currentWorkspace)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </>
          )}

          <Button
            size="sm"
            className="gap-1.5 text-xs font-medium shadow-xs"
            onClick={() => {
              setEditingWorkspace(null);
              setModalOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            New Workspace
          </Button>
        </div>
      </div>

      {/* Main Workspace Content or Empty State */}
      {workspacesQuery.isLoading ? (
        <div className="p-12 text-center text-xs text-muted-foreground">Loading workspaces…</div>
      ) : workspaces.length === 0 ? (
        /* Empty State Onboarding */
        <div className="rounded-2xl border border-dashed p-10 text-center max-w-xl mx-auto space-y-4 my-12 bg-card/30">
          <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Boxes className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-foreground">No Multi-Repo Workspaces yet</h2>
            <p className="text-xs text-muted-foreground">
              Ideal for microservices architectures, monorepos, and split frontend + backend projects.
              Group related git repositories to observe their global status and execute batch pull/fetch actions in one click.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="sm"
              onClick={() => {
                setEditingWorkspace(null);
                setModalOpen(true);
              }}
              className="gap-1.5 text-xs"
            >
              <Plus className="size-3.5" />
              Create your first Workspace
            </Button>

            {Boolean(recent.data?.length) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCreateFromRecent()}
                className="gap-1.5 text-xs"
              >
                <FolderPlus className="size-3.5" />
                Create from Recent Repositories ({recent.data?.length})
              </Button>
            )}
          </div>
        </div>
      ) : currentWorkspace ? (
        <MultiRepoDashboard
          key={currentWorkspace.id}
          workspace={currentWorkspace}
          onRefresh={() => void workspacesQuery.refetch()}
        />
      ) : null}

      {/* Create / Edit Modal */}
      <MultiRepoModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        workspace={editingWorkspace}
        onSave={async (ws) => {
          await saveMutation.mutateAsync(ws);
        }}
      />
    </div>
  );
}
