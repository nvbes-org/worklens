import { AlertTriangle, History, Shield, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import type { AutoKillEvent, AutoKillPolicy, KillAction } from '@worklens/contracts';

interface AutoKillSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  policy: AutoKillPolicy;
  onSavePolicy: (policy: AutoKillPolicy) => void;
  events: AutoKillEvent[];
}

export function AutoKillSettingsModal({
  isOpen,
  onClose,
  policy,
  onSavePolicy,
  events,
}: AutoKillSettingsModalProps) {
  const [enabled, setEnabled] = useState(policy.enabled);
  const [action, setAction] = useState<KillAction>(policy.action);
  const [maxMemMb, setMaxMemMb] = useState<number>(
    policy.maxMemoryBytes ? Math.round(Number(policy.maxMemoryBytes) / (1024 * 1024)) : 2048,
  );
  const [maxCpu, setMaxCpu] = useState<number>(policy.maxCpuPercent ?? 90);
  const [sustainedSecs, setSustainedSecs] = useState<number>(policy.cpuSustainedSeconds ?? 30);
  const [protectExternals, setProtectExternals] = useState(policy.protectExternals);
  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');

  if (!isOpen) return null;

  const handleSave = () => {
    onSavePolicy({
      ...policy,
      enabled,
      action,
      maxMemoryBytes: BigInt(maxMemMb * 1024 * 1024),
      maxCpuPercent: maxCpu,
      cpuSustainedSeconds: sustainedSecs,
      protectExternals,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-400" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Auto-Killer & Resource Guard</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border-subtle)] px-4 bg-[var(--surface-subtle)]">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-[var(--accent)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            Guard Policy Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-[var(--accent)] text-[var(--text-primary)]'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <History className="size-3.5" />
            <span>Audit History ({events.length})</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'settings' ? (
            <>
              {/* Enabled toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
                <div>
                  <span className="text-xs font-semibold text-[var(--text-primary)] block">
                    Enable Auto-Killer Watchdog
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Continuously checks active processes against resource limits.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="size-4 accent-[var(--accent)] cursor-pointer"
                />
              </div>

              {/* Action selection */}
              <div>
                <label className="text-xs font-semibold text-[var(--text-primary)] block mb-1">
                  Enforcement Action
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'warn', label: 'Warn Only', desc: 'Alert without killing' },
                    { id: 'graceful_kill', label: 'Graceful', desc: 'SIGTERM then SIGKILL' },
                    { id: 'immediate_kill', label: 'Force Kill', desc: 'Instant SIGKILL' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAction(item.id as KillAction)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        action === item.id
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]'
                      }`}
                    >
                      <span className="text-xs font-medium block">{item.label}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Memory Limit Slider */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[var(--text-primary)]">Max Memory (RAM)</span>
                  <span className="font-mono text-[var(--accent)] font-semibold">{maxMemMb} MB</span>
                </div>
                <input
                  type="range"
                  min="256"
                  max="8192"
                  step="256"
                  value={maxMemMb}
                  onChange={(e) => setMaxMemMb(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
                <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                  <span>256 MB</span>
                  <span>2 GB</span>
                  <span>8 GB</span>
                </div>
              </div>

              {/* CPU Limit Slider */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[var(--text-primary)]">Max Sustained CPU</span>
                  <span className="font-mono text-[var(--accent)] font-semibold">{maxCpu}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={maxCpu}
                  onChange={(e) => setMaxCpu(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>

              {/* Sustained Duration */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-[var(--text-primary)]">Sustained High CPU Window</span>
                  <span className="font-mono text-[var(--accent)] font-semibold">{sustainedSecs}s</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={sustainedSecs}
                  onChange={(e) => setSustainedSecs(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
              </div>

              {/* Protect Externals */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
                <div>
                  <span className="text-xs font-semibold text-[var(--text-primary)] block">
                    Protect External Processes
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Never terminate processes launched outside Worklens; warn only.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={protectExternals}
                  onChange={(e) => setProtectExternals(e.target.checked)}
                  className="size-4 accent-[var(--accent)] cursor-pointer"
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--text-muted)]">
                  No auto-kill events triggered yet. All processes are within limits!
                </div>
              ) : (
                events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {ev.processName} (PID {ev.pid})
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        {ev.timestamp.substring(11, 19)}
                      </span>
                    </div>
                    <p className="text-[var(--text-secondary)]">{ev.reason}</p>
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-1 border-t border-amber-500/10">
                      <span>Action: {ev.actionTaken}</span>
                      <span>{(Number(ev.memoryBytes) / (1024 * 1024)).toFixed(0)} MB | {Math.round(ev.cpuPercent)}% CPU</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:opacity-90 font-medium transition-opacity shadow-sm"
          >
            Save Policy
          </button>
        </div>
      </div>
    </div>
  );
}
