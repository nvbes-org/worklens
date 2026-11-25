import type { EngineRealtimeStatus } from '@worklens/contracts';
import { Activity, Box, Boxes, Layers, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EngineCard } from '../components/engines/engine-card';
import { EngineLogsModal } from '../components/engines/engine-logs-modal';
import { Button } from '../components/ui/button';
import { executeEngineAction, getEnginesRealtimeList } from '../lib/engine-api';
import { useSession } from '../lib/session';

type EngineCategory = 'all' | 'docker' | 'oci' | 'apple-container' | 'kubernetes' | 'devcontainer';

export function EnginesPage() {
  const { repo } = useSession();
  const repoPath = repo?.path;

  const [engines, setEngines] = useState<EngineRealtimeStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(2000); // 2s default
  const [activeCategory, setActiveCategory] = useState<EngineCategory>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [logsModal, setLogsModal] = useState<{
    isOpen: boolean;
    title: string;
    logs: string;
  }>({
    isOpen: false,
    title: '',
    logs: '',
  });

  const loadEngines = useCallback(async () => {
    try {
      const data = await getEnginesRealtimeList(repoPath);
      setEngines(data);
    } catch (e) {
      console.error('Failed to load realtime engines:', e);
    }
  }, [repoPath]);

  // Initial load
  useEffect(() => {
    setIsLoading(true);
    void loadEngines().finally(() => setIsLoading(false));
  }, [loadEngines]);

  // Realtime Polling Loop
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const interval = setInterval(() => {
      void loadEngines();
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, loadEngines]);

  const handleAction = async (engineId: string, action: string, params: Record<string, unknown>) => {
    try {
      await executeEngineAction(engineId, action, params, repoPath);
      await loadEngines();
    } catch (e) {
      console.error(`Action ${action} on ${engineId} failed:`, e);
      alert(`Action '${action}' failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleViewLogs = async (engineId: string, instanceId: string, instanceName: string) => {
    try {
      const res = await executeEngineAction(
        engineId,
        'logs',
        { containerId: instanceId, podId: instanceId },
        repoPath,
      );
      const data = res.data as { logs?: string } | undefined;
      const logs = data?.logs ?? res.stdout ?? 'No logs returned.';
      setLogsModal({
        isOpen: true,
        title: `Logs: ${instanceName} (${engineId})`,
        logs,
      });
    } catch (e) {
      console.error('Failed to fetch logs:', e);
      setLogsModal({
        isOpen: true,
        title: `Logs: ${instanceName} (${engineId})`,
        logs: `Error fetching logs: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  // Metrics summary
  const totalEngines = engines.length;
  const runningEngines = engines.filter((e) => e.isRunning).length;
  const totalInstances = engines.reduce((acc, e) => acc + e.instances.length, 0);
  const activeInstances = engines.reduce(
    (acc, e) =>
      acc +
      e.instances.filter(
        (i) => i.status.toLowerCase().includes('up') || i.status.toLowerCase().includes('running'),
      ).length,
    0,
  );

  const filteredEngines = engines.filter((e) => {
    if (activeCategory !== 'all' && e.engineId !== activeCategory) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-zinc-950 p-6 text-zinc-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-zinc-50">Engines & Containers</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              {refreshInterval > 0 ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  REALTIME ({refreshInterval / 1000}s)
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                  PAUSED
                </>
              )}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            Realtime monitoring for Docker, OCI, Apple Containers, Kubernetes & Devcontainers
          </p>
        </div>

        {/* Polling controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 text-xs">
            {[
              { label: '1s', val: 1000 },
              { label: '2s', val: 2000 },
              { label: '5s', val: 5000 },
              { label: 'Pause', val: 0 },
            ].map((item) => (
              <button
                type="button"
                key={item.label}
                onClick={() => setRefreshInterval(item.val)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  refreshInterval === item.val
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadEngines()}
            disabled={isLoading}
            className="h-8 gap-1.5 border-zinc-800 bg-zinc-900 text-xs text-zinc-200 hover:bg-zinc-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="my-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Detected Engines</span>
            <Boxes className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="mt-1 text-2xl font-bold text-zinc-100">{totalEngines}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {runningEngines} active daemon{runningEngines !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Containers</span>
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{activeInstances}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">{totalInstances} total recorded</div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Daemon Status</span>
            <Box className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-1 text-2xl font-bold text-zinc-100">
            {runningEngines > 0 ? 'Connected' : 'Idle'}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {runningEngines > 0 ? 'Zero-trust socket active' : 'Daemons offline'}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Orchestration</span>
            <Layers className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-1 text-2xl font-bold text-zinc-100">
            {engines.find((e) => e.engineId === 'kubernetes')?.instances.length ?? 0}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">Kubernetes Pods</div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'All Engines' },
            { id: 'docker', label: 'Docker' },
            { id: 'oci', label: 'OCI (Podman)' },
            { id: 'apple-container', label: 'Apple Container' },
            { id: 'kubernetes', label: 'Kubernetes' },
            { id: 'devcontainer', label: 'Devcontainer' },
          ].map((cat) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as EngineCategory)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeCategory === cat.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter instances, images, ports..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-card pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-hidden"
          />
        </div>
      </div>

      {/* Engine Cards List */}
      <div className="flex flex-col gap-4">
        {filteredEngines.length > 0 ? (
          filteredEngines.map((engine) => (
            <EngineCard
              key={engine.engineId}
              engine={engine}
              searchFilter={searchFilter}
              onAction={handleAction}
              onViewLogs={handleViewLogs}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center bg-card/20">
            <Boxes className="h-8 w-8 text-muted-foreground" />
            <h3 className="mt-2 text-sm font-medium text-foreground">No engines found</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              No matching engine or container instances available for this filter.
            </p>
          </div>
        )}
      </div>

      {/* Logs Drawer Modal */}
      <EngineLogsModal
        isOpen={logsModal.isOpen}
        title={logsModal.title}
        logs={logsModal.logs}
        onClose={() => setLogsModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
