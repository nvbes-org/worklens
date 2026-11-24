import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EngineActionResponse, EngineInfo, Operation, PluginMetadata } from '@worklens/contracts';
import { Blocks, CheckCircle2, Download, Play, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { PreferenceRow, SettingsSection, Switch } from './settings-common';

export function SettingsPluginsEngines() {
  const qc = useQueryClient();
  const [installPath, setInstallPath] = useState('');
  const [testEngineId, setTestEngineId] = useState('cargo');
  const [testAction, setTestAction] = useState('metadata');
  const [execResult, setExecResult] = useState<EngineActionResponse | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: plugins = [], refetch: refetchPlugins } = useQuery({
    queryKey: ['plugins_list'],
    queryFn: () => query<PluginMetadata[]>('plugin_list'),
  });

  const { data: engines = [], refetch: refetchEngines } = useQuery({
    queryKey: ['engines_list'],
    queryFn: () => query<EngineInfo[]>('engines_list'),
  });

  const installMutation = useMutation({
    mutationFn: (path: string) => query<PluginMetadata>('plugin_install', null, { path }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['plugins_list'] });
      qc.invalidateQueries({ queryKey: ['engines_list'] });
      setInstallPath('');
      setMsg(`Plugin '${p.name}' installed successfully.`);
      setTimeout(() => setMsg(null), 3000);
    },
    onError: (e) => setMsg(`Installation failed: ${String(e)}`),
  });

  const uninstallMutation = useMutation({
    mutationFn: (id: string) => query<{ uninstalled: boolean }>('plugin_uninstall', null, { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plugins_list'] });
      qc.invalidateQueries({ queryKey: ['engines_list'] });
      setMsg('Plugin uninstalled.');
      setTimeout(() => setMsg(null), 3000);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) => {
      const op: Operation = enable ? 'plugin_enable' : 'plugin_disable';
      return query<{ enabled: boolean }>(op, null, { id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plugins_list'] });
      qc.invalidateQueries({ queryKey: ['engines_list'] });
    },
  });

  const execMutation = useMutation({
    mutationFn: () =>
      query<EngineActionResponse>('engine_execute', null, {
        engineId: testEngineId,
        action: testAction,
        params: {},
      }),
    onSuccess: (data) => setExecResult(data),
    onError: (e) => setExecResult({ success: false, data: null, stdout: '', stderr: String(e) }),
  });

  const selectedEngine = engines.find((e) => e.id === testEngineId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/20 p-4">
        <div>
          <div className="flex items-center gap-2">
            <Blocks className="size-5 text-primary" />
            <span className="text-sm font-semibold">Plugin & Tooling Engine Ecosystem</span>
            <Badge variant="outline" className="border-primary/30 text-primary">
              Dynamic Registry
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Plugins root: <code className="font-mono text-[11px] text-foreground">~/.worklens/plugins/</code>
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void refetchPlugins();
            void refetchEngines();
          }}
        >
          <RefreshCw className="mr-1.5 size-3.5" />
          Refresh Registry
        </Button>
      </div>

      <SettingsSection
        title="Installed Plugins"
        description="Modular plugins extending Worklens with custom tooling engines and handlers"
        action={
          <div className="flex items-center gap-2">
            <Input
              className="w-72 text-xs"
              placeholder="Local directory path (containing plugin.json)"
              value={installPath}
              onChange={(e) => setInstallPath(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => installPath && installMutation.mutate(installPath)}
              disabled={!installPath || installMutation.isPending}
            >
              <Download className="mr-1.5 size-3.5" />
              Install
            </Button>
          </div>
        }
      >
        {plugins.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No external plugins installed yet in <code className="font-mono">~/.worklens/plugins/</code>.
          </div>
        ) : (
          plugins.map((p) => {
            const isEnabled = p.status === 'enabled' || p.status === 'installed';
            return (
              <PreferenceRow
                key={p.id}
                title={`${p.name} v${p.version}`}
                description={
                  <div className="space-y-1">
                    <div>{p.description || 'Custom plugin extension'}</div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>By: {p.author || 'Unknown'}</span>
                      <span>·</span>
                      <span>{p.enginesCount} engines</span>
                      <span>·</span>
                      <span>{p.permissionsCount} permissions</span>
                    </div>
                  </div>
                }
              >
                <div className="flex items-center gap-3">
                  <Switch
                    label="Toggle Plugin"
                    checked={isEnabled}
                    onChange={(checked) => toggleMutation.mutate({ id: p.id, enable: checked })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => uninstallMutation.mutate(p.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </PreferenceRow>
            );
          })
        )}
      </SettingsSection>

      <SettingsSection
        title="Tooling Engines Registry"
        description="Built-in and plugin-provided build systems, package managers, IaC and CLIs"
      >
        {engines.map((eng) => (
          <PreferenceRow
            key={eng.id}
            title={eng.name}
            description={
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono font-medium text-foreground">{eng.id}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {eng.kind}
                  </Badge>
                  {eng.pluginId && (
                    <Badge variant="secondary" className="text-[10px]">
                      Plugin: {eng.pluginId}
                    </Badge>
                  )}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground truncate max-w-md">
                  {eng.version || 'Version info unavailable'}
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {eng.supportedActions.map((act) => (
                    <span
                      key={act}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                    >
                      {act}
                    </span>
                  ))}
                </div>
              </div>
            }
          >
            <div className="flex items-center gap-2">
              <Badge
                variant={eng.available ? 'default' : 'secondary'}
                className={eng.available ? 'bg-emerald-600/15 text-emerald-700' : 'text-muted-foreground'}
              >
                {eng.available ? 'Available' : 'Missing Binary'}
              </Badge>
            </div>
          </PreferenceRow>
        ))}
      </SettingsSection>

      <SettingsSection
        title="Engine Action Execution Tester"
        description="Run non-destructive query actions across discovered tooling engines"
      >
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="preference-select"
              value={testEngineId}
              onChange={(e) => {
                setTestEngineId(e.target.value);
                const nextEng = engines.find((eng) => eng.id === e.target.value);
                if (nextEng?.supportedActions[0]) {
                  setTestAction(nextEng.supportedActions[0]);
                }
              }}
            >
              {engines.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.name} ({eng.id})
                </option>
              ))}
            </select>

            <select
              className="preference-select"
              value={testAction}
              onChange={(e) => setTestAction(e.target.value)}
            >
              {selectedEngine?.supportedActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>

            <Button size="sm" onClick={() => execMutation.mutate()} disabled={execMutation.isPending}>
              <Play className="mr-1.5 size-3.5" />
              Execute Action
            </Button>
          </div>

          {execResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {execResult.success ? (
                  <span className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="size-4" /> Success
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle className="size-4" /> Failed
                  </span>
                )}
              </div>
              <pre className="max-h-60 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-[11px] text-foreground">
                {execResult.stdout || execResult.stderr || JSON.stringify(execResult.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </SettingsSection>

      {msg && <div className="rounded-lg bg-primary/5 p-3 text-xs font-medium text-primary">{msg}</div>}
    </div>
  );
}
