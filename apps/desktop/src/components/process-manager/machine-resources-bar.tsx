import { Activity, Cpu, HardDrive, MemoryStick, RefreshCw, Server } from 'lucide-react';
import type { MachineResources } from '@worklens/contracts';

interface MachineResourcesBarProps {
  resources: MachineResources | null;
  isLoading: boolean;
  onRefresh: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
}

export function MachineResourcesBar({
  resources,
  isLoading,
  onRefresh,
  autoRefresh,
  onToggleAutoRefresh,
}: MachineResourcesBarProps) {
  if (!resources) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] animate-pulse">
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Activity className="size-4 animate-spin text-[var(--accent)]" />
          <span>Collecting system resources...</span>
        </div>
      </div>
    );
  }

  const totalMemGb = (Number(resources.totalMemoryBytes) / (1024 * 1024 * 1024)).toFixed(1);
  const usedMemGb = (Number(resources.usedMemoryBytes) / (1024 * 1024 * 1024)).toFixed(1);
  const memPercent =
    Number(resources.totalMemoryBytes) > 0
      ? Math.round((Number(resources.usedMemoryBytes) / Number(resources.totalMemoryBytes)) * 100)
      : 0;

  const cpuPercent = Math.round(resources.cpuGlobalPercent);
  const isHighCpu = cpuPercent > 85;
  const isHighMem = memPercent > 85;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] backdrop-blur-md shadow-sm">
      <div className="flex flex-wrap items-center gap-6">
        {/* Global CPU */}
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg ${
              isHighCpu ? 'bg-red-500/10 text-red-400' : 'bg-[var(--accent)]/10 text-[var(--accent)]'
            }`}
          >
            <Cpu className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-muted)]">CPU Total</span>
              <span className={`text-xs font-semibold ${isHighCpu ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>
                {cpuPercent}%
              </span>
            </div>
            <div className="w-24 h-1.5 mt-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${isHighCpu ? 'bg-red-500' : 'bg-[var(--accent)]'}`}
                style={{ width: `${Math.min(cpuPercent, 100)}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] font-mono self-end">
            {resources.cpuCount} cores
          </span>
        </div>

        {/* Global Memory */}
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg ${
              isHighMem ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
            }`}
          >
            <MemoryStick className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-muted)]">Memory</span>
              <span className={`text-xs font-semibold ${isHighMem ? 'text-amber-400' : 'text-[var(--text-primary)]'}`}>
                {usedMemGb} / {totalMemGb} GB
              </span>
            </div>
            <div className="w-24 h-1.5 mt-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${isHighMem ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(memPercent, 100)}%` }}
              />
            </div>
          </div>
          <span className="text-[10px] text-[var(--text-muted)] font-mono self-end">{memPercent}%</span>
        </div>

        {/* Load Average */}
        <div className="hidden lg:flex items-center gap-2 text-xs">
          <Server className="size-3.5 text-[var(--text-muted)]" />
          <span className="text-[var(--text-muted)]">Load:</span>
          <span className="font-mono text-[var(--text-secondary)]">
            {resources.loadAverage.map((l) => l.toFixed(2)).join(', ')}
          </span>
        </div>

        {/* Storage */}
        {resources.disks.length > 0 && (
          <div className="hidden xl:flex items-center gap-2 text-xs">
            <HardDrive className="size-3.5 text-[var(--text-muted)]" />
            <span className="text-[var(--text-muted)]">Disk:</span>
            <span className="font-mono text-[var(--text-secondary)]">
              {(Number(resources.disks[0].availableBytes) / (1024 * 1024 * 1024)).toFixed(0)} GB free
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleAutoRefresh}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors border ${
            autoRefresh
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
          title="Toggle live polling (1s)"
        >
          {autoRefresh ? '● Live (1s)' : '○ Paused'}
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1.5 rounded-md border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)] transition-colors"
          title="Refresh now"
        >
          <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
