import type { EngineRealtimeStatus } from '@worklens/contracts';
import {
  Activity,
  Box,
  Boxes,
  CheckCircle2,
  Cpu,
  Layers,
  Play,
  RotateCw,
  Square,
  Terminal,
  XCircle,
} from 'lucide-react';
import { Button } from '../ui/button';

interface EngineCardProps {
  engine: EngineRealtimeStatus;
  searchFilter: string;
  onAction: (engineId: string, action: string, params: Record<string, unknown>) => Promise<void>;
  onViewLogs: (engineId: string, instanceId: string, instanceName: string) => Promise<void>;
}

export function EngineCard({ engine, searchFilter, onAction, onViewLogs }: EngineCardProps) {
  const getIcon = () => {
    switch (engine.engineId) {
      case 'docker':
        return <Box className="h-5 w-5 text-sky-400" />;
      case 'oci':
        return <Layers className="h-5 w-5 text-purple-400" />;
      case 'apple-container':
        return <Cpu className="h-5 w-5 text-amber-400" />;
      case 'kubernetes':
        return <Boxes className="h-5 w-5 text-blue-400" />;
      case 'devcontainer':
        return <Terminal className="h-5 w-5 text-emerald-400" />;
      default:
        return <Activity className="h-5 w-5 text-zinc-400" />;
    }
  };

  const filteredInstances = engine.instances.filter((inst) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      inst.name.toLowerCase().includes(q) ||
      inst.id.toLowerCase().includes(q) ||
      inst.image.toLowerCase().includes(q) ||
      inst.status.toLowerCase().includes(q)
    );
  });

  const isInstanceRunning = (status: string) => {
    const s = status.toLowerCase();
    return s.includes('up') || s.includes('running') || s.includes('active');
  };

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-border/80">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/50">
            {getIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground">{engine.engineName}</h3>
              <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {engine.engineId}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{engine.summary}</p>
          </div>
        </div>

        {/* Engine status indicator */}
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-md border border-border bg-muted/60 px-2 py-1 font-mono text-foreground">
            {engine.endpointOrContext}
          </span>
          {engine.isRunning ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Running
            </span>
          ) : engine.available ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
              <CheckCircle2 className="h-3 w-3" />
              Available
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <XCircle className="h-3 w-3" />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Instances list / table */}
      <div className="mt-3">
        {filteredInstances.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Name / ID</th>
                  <th className="py-2 pr-3 font-medium">Image / Kind</th>
                  <th className="py-2 pr-3 font-medium">Ports</th>
                  <th className="py-2 pr-3 font-medium">CPU</th>
                  <th className="py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredInstances.map((inst) => {
                  const running = isInstanceRunning(inst.status);
                  return (
                    <tr key={inst.id} className="group hover:bg-muted/40">
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            running
                              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : inst.status.toLowerCase().includes('stop')
                                ? 'border border-border bg-muted text-muted-foreground'
                                : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              running ? 'bg-emerald-400' : 'bg-zinc-500'
                            }`}
                          />
                          {inst.status}
                        </span>
                      </td>

                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-foreground">{inst.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px]">
                          {inst.id}
                        </div>
                      </td>

                      <td className="py-2.5 pr-3 text-foreground font-mono text-[11px] truncate max-w-[200px]">
                        {inst.image}
                      </td>

                      <td className="py-2.5 pr-3 text-muted-foreground font-mono text-[11px]">
                        {inst.ports.length > 0 ? inst.ports.join(', ') : '—'}
                      </td>

                      <td className="py-2.5 pr-3 text-foreground font-mono text-[11px]">
                        {inst.cpuPercent !== null ? `${inst.cpuPercent.toFixed(1)}%` : '—'}
                      </td>

                      <td className="py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {running ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-7 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                              onClick={() =>
                                void onAction(engine.engineId, 'stop', {
                                  containerId: inst.id,
                                  name: inst.name,
                                })
                              }
                              title="Stop"
                            >
                              <Square className="h-3 w-3" />
                              Stop
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-7 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                              onClick={() =>
                                void onAction(engine.engineId, 'start', {
                                  containerId: inst.id,
                                  name: inst.name,
                                })
                              }
                              title="Start"
                            >
                              <Play className="h-3 w-3" />
                              Start
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-7 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              void onAction(engine.engineId, 'restart', {
                                containerId: inst.id,
                                name: inst.name,
                              })
                            }
                            title="Restart"
                          >
                            <RotateCw className="h-3 w-3" />
                          </Button>

                          <Button
                            variant="outline"
                            size="xs"
                            className="h-7 gap-1 border-border bg-muted/60 text-foreground hover:bg-muted"
                            onClick={() => void onViewLogs(engine.engineId, inst.id, inst.name)}
                            title="View live logs"
                          >
                            <Terminal className="h-3 w-3" />
                            Logs
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground">
            {engine.isRunning
              ? 'No matching instances currently running on this engine.'
              : 'Engine is offline or not installed.'}
          </div>
        )}
      </div>
    </div>
  );
}
