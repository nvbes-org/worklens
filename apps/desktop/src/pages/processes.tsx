import { Activity, Bug, Key, Play, Plus, RefreshCw, ShieldAlert, Terminal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  AutoKillSettingsModal,
  DebugToolsDrawer,
  DiscoveredCommandsList,
  EnvProfilesModal,
  MachineResourcesBar,
  ProcessCard,
  ProcessJournalView,
} from '../components/process-manager';
import {
  clearProcessLogs,
  getAutoKillEvents,
  getAutoKillPolicy,
  getDiscoveredCommands,
  getEnvironmentProfiles,
  getMachineResources,
  getProcesses,
  getProcessLogs,
  killProcess,
  restartProcess,
  saveEnvironmentProfile,
  sendProcessInput,
  setAutoKillPolicy,
  startProcess,
  stopProcess,
} from '../lib/process-api';
import { useSession } from '../lib/session';
import type {
  AutoKillEvent,
  AutoKillPolicy,
  DebugMode,
  DiscoveredCommand,
  EnvironmentProfile,
  MachineResources,
  ProcessInfo,
  ProcessJournalEntry,
} from '@worklens/contracts';

export function ProcessesPage() {
  const { repo } = useSession();
  const repoPath = repo?.path;

  // Telemetry & Data states
  const [resources, setResources] = useState<MachineResources | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [commands, setCommands] = useState<DiscoveredCommand[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [logs, setLogs] = useState<ProcessJournalEntry[]>([]);
  const [policy, setPolicy] = useState<AutoKillPolicy | null>(null);
  const [killEvents, setKillEvents] = useState<AutoKillEvent[]>([]);
  const [profiles, setProfiles] = useState<EnvironmentProfile[]>([]);

  // UI Modals states
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  const [isAutoKillOpen, setIsAutoKillOpen] = useState(false);
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [isDebugDrawerOpen, setIsDebugDrawerOpen] = useState(false);
  const [debugPort, setDebugPort] = useState<number | undefined>(undefined);
  const [mainTab, setMainTab] = useState<'processes' | 'commands'>('processes');

  // Load telemetry & processes
  const loadTelemetry = useCallback(async () => {
    try {
      const [res, procs] = await Promise.all([
        getMachineResources(),
        getProcesses(repoPath),
      ]);
      setResources(res);
      setProcesses(procs);

      // Select first process if none selected
      if (!selectedProcessId && procs.length > 0) {
        setSelectedProcessId(procs[0].id);
      }
    } catch (e) {
      console.error('Failed to load processes telemetry:', e);
    }
  }, [repoPath, selectedProcessId]);

  // Load commands and policy once on mount or repo change
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const [cmds, pol, evts, profs] = await Promise.all([
          getDiscoveredCommands(repoPath),
          getAutoKillPolicy(),
          getAutoKillEvents(),
          getEnvironmentProfiles(),
        ]);
        setCommands(cmds);
        setPolicy(pol);
        setKillEvents(evts);
        setProfiles(profs);
      } catch (e) {
        console.error('Failed to init process manager:', e);
      } finally {
        setIsLoading(false);
      }
    }
    void init();
  }, [repoPath]);

  // Polling loop for live telemetry
  useEffect(() => {
    void loadTelemetry();
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      void loadTelemetry();
    }, 1500);

    return () => clearInterval(timer);
  }, [loadTelemetry, autoRefresh]);

  // Polling loop for logs of selected process
  useEffect(() => {
    if (!selectedProcessId) {
      setLogs([]);
      return;
    }

    let isMounted = true;
    async function fetchLogs() {
      try {
        const entries = await getProcessLogs(selectedProcessId!);
        if (isMounted) setLogs(entries);
      } catch (e) {
        console.error('Failed to fetch logs:', e);
      }
    }

    void fetchLogs();
    const logTimer = setInterval(fetchLogs, 1200);

    return () => {
      isMounted = false;
      clearInterval(logTimer);
    };
  }, [selectedProcessId]);

  const selectedProcess = processes.find((p) => p.id === selectedProcessId) || null;

  // Actions
  const handleRunCommand = async (cmd: DiscoveredCommand, debugMode: DebugMode) => {
    try {
      const proc = await startProcess(
        {
          command: cmd.command.split(' ')[0],
          args: cmd.args,
          cwd: repoPath,
          componentId: cmd.componentId,
          debugMode,
        },
        repoPath,
      );
      setSelectedProcessId(proc.id);
      setMainTab('processes');
      void loadTelemetry();
    } catch (e) {
      console.error('Failed to run command:', e);
    }
  };

  const handleStop = async (id: string) => {
    try {
      await stopProcess(id);
      void loadTelemetry();
    } catch (e) {
      console.error('Failed to stop process:', e);
    }
  };

  const handleKill = async (id: string) => {
    try {
      await killProcess(id);
      void loadTelemetry();
    } catch (e) {
      console.error('Failed to kill process:', e);
    }
  };

  const handleRestart = async (proc: ProcessInfo) => {
    try {
      await restartProcess(
        {
          id: proc.id,
          command: proc.command,
          args: proc.args,
          cwd: proc.cwd,
          componentId: proc.componentId ?? undefined,
          debugMode: proc.debugMode,
        },
        repoPath,
      );
      void loadTelemetry();
    } catch (e) {
      console.error('Failed to restart process:', e);
    }
  };

  const handleSendInput = async (text: string) => {
    if (!selectedProcessId) return;
    try {
      await sendProcessInput(selectedProcessId, text);
    } catch (e) {
      console.error('Failed to send stdin:', e);
    }
  };

  const handleClearLogs = async () => {
    if (!selectedProcessId) return;
    try {
      await clearProcessLogs(selectedProcessId);
      setLogs([]);
    } catch (e) {
      console.error('Failed to clear logs:', e);
    }
  };

  const handleSavePolicy = async (newPolicy: AutoKillPolicy) => {
    try {
      await setAutoKillPolicy(newPolicy);
      setPolicy(newPolicy);
    } catch (e) {
      console.error('Failed to save policy:', e);
    }
  };

  const handleOpenPreview = (port: number) => {
    setDebugPort(port);
    setIsDebugDrawerOpen(true);
  };

  return (
    <div className="flex flex-col h-full p-4 space-y-4 overflow-hidden bg-[var(--surface-canvas)]">
      {/* 1. System Telemetry Bar */}
      <MachineResourcesBar
        resources={resources}
        isLoading={isLoading}
        onRefresh={() => void loadTelemetry()}
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh((r) => !r)}
      />

      {/* 2. Page Subheader / Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Main View Tabs */}
          <div className="flex items-center rounded-xl border border-[var(--border-subtle)] p-0.5 bg-[var(--surface-subtle)]">
            <button
              type="button"
              onClick={() => setMainTab('processes')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                mainTab === 'processes'
                  ? 'bg-[var(--surface-active)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Activity className="size-3.5 text-[var(--accent)]" />
              <span>Active Processes ({processes.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setMainTab('commands')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                mainTab === 'commands'
                  ? 'bg-[var(--surface-active)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Play className="size-3.5 text-emerald-400" />
              <span>Runnable Scripts ({commands.length})</span>
            </button>
          </div>
        </div>

        {/* Global Action Modals Trigger */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEnvModalOpen(true)}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all flex items-center gap-1.5"
            title="Manage environment profiles and variable overrides"
          >
            <Key className="size-3.5 text-[var(--accent)]" />
            <span>Environments</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAutoKillOpen(true)}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-all flex items-center gap-1.5"
            title="Configure Auto-Killer & Watchdog protection"
          >
            <ShieldAlert className="size-3.5 text-amber-400" />
            <span>Auto-Killer</span>
            {policy?.enabled && (
              <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
            )}
          </button>

          {selectedProcess && (
            <button
              type="button"
              onClick={() => {
                setDebugPort(selectedProcess.ports[0]);
                setIsDebugDrawerOpen(true);
              }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-all flex items-center gap-1.5"
              title="Open Debug Tools drawer for selected process"
            >
              <Bug className="size-3.5" />
              <span>Debug Studio</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Main Split View: (Processes/Commands Grid) + (Journal View) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Left Column (5 cols): Process Cards or Commands */}
        <div className="lg:col-span-5 h-full overflow-y-auto pr-1">
          {mainTab === 'processes' ? (
            processes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center border border-[var(--border-subtle)] rounded-xl bg-[var(--surface-subtle)] text-[var(--text-muted)]">
                <Activity className="size-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">No active processes detected</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Start a script from the &quot;Runnable Scripts&quot; tab or run a command in your terminal.
                </p>
                <button
                  type="button"
                  onClick={() => setMainTab('commands')}
                  className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:opacity-90"
                >
                  Browse Runnable Scripts
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {processes.map((proc) => (
                  <ProcessCard
                    key={proc.id}
                    process={proc}
                    isSelected={selectedProcessId === proc.id}
                    onSelect={() => setSelectedProcessId(proc.id)}
                    onStop={() => void handleStop(proc.id)}
                    onKill={() => void handleKill(proc.id)}
                    onRestart={() => void handleRestart(proc)}
                    onOpenPreview={handleOpenPreview}
                    onOpenDebug={() => {
                      setSelectedProcessId(proc.id);
                      setDebugPort(proc.ports[0]);
                      setIsDebugDrawerOpen(true);
                    }}
                  />
                ))}
              </div>
            )
          ) : (
            <DiscoveredCommandsList
              commands={commands}
              isLoading={isLoading}
              onRunCommand={handleRunCommand}
            />
          )}
        </div>

        {/* Right Column (7 cols): Interactive Journal & Output */}
        <div className="lg:col-span-7 h-full">
          <ProcessJournalView
            process={selectedProcess}
            logs={logs}
            isLoading={isLogsLoading}
            onSendInput={handleSendInput}
            onClearLogs={() => void handleClearLogs()}
            onOpenUrl={(url) => {
              if (url.includes('localhost:') || url.includes('127.0.0.1:')) {
                const match = url.match(/:([0-9]+)/);
                if (match) {
                  setDebugPort(Number(match[1]));
                  setIsDebugDrawerOpen(true);
                  return;
                }
              }
              window.open(url, '_blank');
            }}
          />
        </div>
      </div>

      {/* 4. Modals & Drawers */}
      {policy && (
        <AutoKillSettingsModal
          isOpen={isAutoKillOpen}
          onClose={() => setIsAutoKillOpen(false)}
          policy={policy}
          onSavePolicy={handleSavePolicy}
          events={killEvents}
        />
      )}

      <EnvProfilesModal
        isOpen={isEnvModalOpen}
        onClose={() => setIsEnvModalOpen(false)}
        profiles={profiles}
        onSaveProfile={(prof) => void saveEnvironmentProfile(prof)}
        onDeleteProfile={() => {}}
      />

      <DebugToolsDrawer
        isOpen={isDebugDrawerOpen}
        onClose={() => setIsDebugDrawerOpen(false)}
        process={selectedProcess}
        logs={logs}
        initialPort={debugPort}
      />
    </div>
  );
}
