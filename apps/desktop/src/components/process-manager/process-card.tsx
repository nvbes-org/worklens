import { Bug, Clock, Cpu, ExternalLink, Globe, HardDrive, MemoryStick, Play, RotateCcw, Square, Terminal, Trash2 } from 'lucide-react';
import type { ProcessInfo } from '@worklens/contracts';

interface ProcessCardProps {
  process: ProcessInfo;
  isSelected: boolean;
  onSelect: () => void;
  onStop: () => void;
  onKill: () => void;
  onRestart: () => void;
  onOpenPreview?: (port: number) => void;
  onOpenDebug?: () => void;
}

export function ProcessCard({
  process,
  isSelected,
  onSelect,
  onStop,
  onKill,
  onRestart,
  onOpenPreview,
  onOpenDebug,
}: ProcessCardProps) {
  const isRunning = process.status === 'running';
  const memMb = (Number(process.memoryBytes) / (1024 * 1024)).toFixed(1);
  const cpuVal = Math.round(process.cpuPercent);

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div
      onClick={onSelect}
      className={`group relative p-3.5 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'border-[var(--accent)] bg-[var(--surface-active)] shadow-sm'
          : 'border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:border-[var(--border-default)]'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`size-2.5 rounded-full shrink-0 ${
              isRunning
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse'
                : process.status === 'killed'
                ? 'bg-amber-500'
                : process.status === 'failed'
                ? 'bg-red-500'
                : 'bg-[var(--text-muted)]'
            }`}
          />
          <span className="font-medium text-sm text-[var(--text-primary)] truncate" title={process.name}>
            {process.name}
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-muted)]">
            PID {process.pid}
          </span>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1.5 shrink-0">
          {process.managed ? (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              Managed
            </span>
          ) : (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/10 text-blue-400">
              Externe
            </span>
          )}

          {process.debugMode !== 'none' && (
            <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-400">
              <Bug className="size-2.5" />
              {process.debugMode}
            </span>
          )}
        </div>
      </div>

      {/* Command Preview */}
      <div className="mb-3">
        <p
          className="text-xs font-mono text-[var(--text-muted)] truncate bg-[var(--surface-sunken)] px-2 py-1 rounded"
          title={process.command}
        >
          {process.command}
        </p>
      </div>

      {/* Resource Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        {/* CPU */}
        <div className="p-1.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-0.5">
            <span className="text-[10px] flex items-center gap-1">
              <Cpu className="size-2.5" /> CPU
            </span>
            <span className={`font-semibold ${cpuVal > 80 ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>
              {cpuVal}%
            </span>
          </div>
          <div className="w-full h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div
              className={`h-full ${cpuVal > 80 ? 'bg-red-500' : 'bg-[var(--accent)]'}`}
              style={{ width: `${Math.min(cpuVal, 100)}%` }}
            />
          </div>
        </div>

        {/* Memory */}
        <div className="p-1.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
          <div className="flex items-center justify-between text-[var(--text-muted)] mb-0.5">
            <span className="text-[10px] flex items-center gap-1">
              <MemoryStick className="size-2.5" /> RAM
            </span>
            <span className="font-semibold text-[var(--text-primary)]">{memMb} MB</span>
          </div>
          <div className="w-full h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.min(process.memoryPercent, 100)}%` }}
            />
          </div>
        </div>

        {/* Uptime */}
        <div className="p-1.5 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)] flex flex-col justify-between">
          <span className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
            <Clock className="size-2.5" /> Uptime
          </span>
          <span className="font-mono text-xs text-[var(--text-primary)] font-medium">
            {formatUptime(Number(process.uptimeSeconds))}
          </span>
        </div>
      </div>

      {/* Ports / URLs */}
      {process.ports.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {process.ports.map((port) => (
            <button
              key={port}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenPreview?.(port);
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-medium rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
              title={`Open preview for port ${port}`}
            >
              <Globe className="size-3" />
              <span>:{port}</span>
              <ExternalLink className="size-2.5" />
            </button>
          ))}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="px-2 py-1 text-xs rounded hover:bg-[var(--surface-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
            title="Open Journal / Logs"
          >
            <Terminal className="size-3" />
            <span>Logs</span>
          </button>

          {process.debugMode !== 'none' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDebug?.();
              }}
              className="px-2 py-1 text-xs rounded hover:bg-[var(--surface-active)] text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
              title="Debug Tools"
            >
              <Bug className="size-3" />
              <span>Debug</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isRunning ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStop();
                }}
                className="p-1 rounded text-[var(--text-muted)] hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                title="Stop Process (SIGTERM)"
              >
                <Square className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestart();
                }}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-active)] transition-colors"
                title="Restart Process"
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onKill();
                }}
                className="p-1 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Force Kill (SIGKILL)"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRestart();
              }}
              className="px-2 py-1 text-xs rounded bg-[var(--accent)] text-white hover:opacity-90 transition-opacity flex items-center gap-1"
              title="Relaunch Process"
            >
              <Play className="size-3" />
              <span>Start</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
