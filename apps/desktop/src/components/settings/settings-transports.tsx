import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TransportStatusReport } from '@worklens/contracts';
import { Bot, Globe, Network, Play, Power, RefreshCw, RotateCcw, Terminal } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { PreferenceRow, SettingsSection } from './settings-common';

const transportIcons: Record<string, typeof Network> = {
  sock: Terminal,
  pipe: Terminal,
  api: Globe,
  mcp: Bot,
};

const transportDescriptions: Record<string, string> = {
  sock: 'Unix domain socket for high-performance zero-copy local IPC',
  pipe: 'Named pipe transport for Windows & local alternative communication',
  api: 'Hyper HTTP server providing REST (/api/v1/request) and SSE (/api/v1/events)',
  mcp: 'Model Context Protocol (rmcp) provider for AI coding agents',
};

export function SettingsTransports() {
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);

  const {
    data: status,
    isPending,
    refetch,
  } = useQuery({
    queryKey: ['transports_status'],
    queryFn: () => query<TransportStatusReport>('transports_status'),
    refetchInterval: 5000,
  });

  const controlMutation = useMutation({
    mutationFn: ({ transport, action }: { transport: string; action: string }) =>
      query<TransportStatusReport>('transport_control', null, { transport, action }),
    onSuccess: (data, vars) => {
      qc.setQueryData(['transports_status'], data);
      setFeedback(`Transport ${vars.transport} action '${vars.action}' succeeded.`);
      setTimeout(() => setFeedback(null), 3500);
    },
    onError: (err) => {
      setFeedback(`Action failed: ${String(err)}`);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/20 p-4">
        <div>
          <div className="flex items-center gap-2">
            <Network className="size-5 text-primary" />
            <span className="text-sm font-semibold">
              Active Profile: {status?.activeProfileId ?? 'default'}
            </span>
            <Badge variant="outline" className="border-primary/30 text-primary">
              Live Dispatcher
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Status reported at {status?.reportedAt ? new Date(status.reportedAt).toLocaleTimeString() : '—'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isPending}>
          <RefreshCw className={`mr-1.5 size-3.5 ${isPending ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
      </div>

      <SettingsSection
        title="Live Transports Dashboard"
        description="Dynamic activation and endpoint status of Worklens communication channels"
      >
        {status?.transports.map((t) => {
          const Icon = transportIcons[t.name] || Network;
          return (
            <PreferenceRow
              key={t.name}
              title={
                <div className="flex items-center gap-1.5">
                  <Icon className="size-4 text-muted-foreground" />
                  <span>{t.name.toUpperCase()}</span>
                </div>
              }
              description={
                <div className="space-y-1">
                  <div>{transportDescriptions[t.name] || 'Custom transport channel'}</div>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-foreground">
                    <span className="text-muted-foreground">Endpoint:</span>
                    <span className="rounded bg-muted px-1.5 py-0.5">{t.endpoint || 'Not bound'}</span>
                    {t.error && <span className="text-destructive font-sans">({t.error})</span>}
                  </div>
                </div>
              }
            >
              <div className="flex items-center gap-3">
                <Badge
                  variant={t.running ? 'default' : 'secondary'}
                  className={
                    t.running
                      ? 'bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/20'
                      : 'text-muted-foreground'
                  }
                >
                  {t.running ? (
                    <span className="flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                      Running
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-muted-foreground/50" />
                      Stopped
                    </span>
                  )}
                </Badge>

                <div className="flex items-center gap-1">
                  {t.running ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0 text-muted-foreground hover:text-destructive"
                      title="Stop transport"
                      onClick={() => controlMutation.mutate({ transport: t.name, action: 'stop' })}
                      disabled={controlMutation.isPending}
                    >
                      <Power className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0 text-muted-foreground hover:text-emerald-600"
                      title="Start transport"
                      onClick={() => controlMutation.mutate({ transport: t.name, action: 'start' })}
                      disabled={controlMutation.isPending}
                    >
                      <Play className="size-4" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-8 p-0 text-muted-foreground hover:text-foreground"
                    title="Restart transport"
                    onClick={() => controlMutation.mutate({ transport: t.name, action: 'restart' })}
                    disabled={controlMutation.isPending}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </div>
              </div>
            </PreferenceRow>
          );
        })}
      </SettingsSection>

      {feedback && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs font-medium text-primary">
          {feedback}
        </div>
      )}

      <div className="rounded-xl border border-border/80 bg-muted/10 p-5 text-xs text-muted-foreground space-y-2">
        <h3 className="font-semibold text-foreground">Multi-Transport Connectivity Architecture</h3>
        <p>
          Worklens implements simultaneous decoupled transports. When enabled, each transport exposes the
          unified request/response protocol. The HTTP API validates mandatory headers configured in the active
          profile, rejecting unauthorised network requests.
        </p>
      </div>
    </div>
  );
}
