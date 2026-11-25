import { Bug, ExternalLink, Globe, Laptop, RefreshCw, Smartphone, Tablet, Terminal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ProcessInfo, ProcessJournalEntry } from '@worklens/contracts';

interface DebugToolsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  process: ProcessInfo | null;
  logs: ProcessJournalEntry[];
  initialPort?: number;
}

export function DebugToolsDrawer({
  isOpen,
  onClose,
  process,
  logs,
  initialPort,
}: DebugToolsDrawerProps) {
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeKey, setIframeKey] = useState(0);

  // Extract Node inspector URL from logs
  const nodeInspectorUrl = useMemo(() => {
    for (const log of logs) {
      const match = log.text.match(/ws:\/\/(?:127\.0\.0\.1|localhost):[0-9]+\/[a-f0-9\-]+/);
      if (match) {
        return `devtools://devtools/bundled/js_app.html?ws=${match[0]}`;
      }
    }
    return null;
  }, [logs]);

  // Detected web port
  const detectedPort = initialPort || process?.ports[0] || 5173;
  const webServerUrl = `http://localhost:${detectedPort}`;

  if (!isOpen || !process) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
        <div className="flex items-center gap-2">
          <Bug className="size-5 text-purple-400" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Built-in Debug Tools — {process.name}
            </h2>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">
              PID {process.pid} | Mode: {process.debugMode.toUpperCase()}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Tools Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Node.js Inspector Card */}
        <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
              <span>🟢</span> Node.js Chrome DevTools Inspector
            </span>
            {nodeInspectorUrl && (
              <span className="text-[10px] text-emerald-400 font-medium">Listening</span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Attach Chrome DevTools directly to the V8 instance running this process.
          </p>

          {nodeInspectorUrl ? (
            <div className="flex items-center gap-2 pt-1">
              <a
                href={nodeInspectorUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors inline-flex items-center gap-1.5 shadow-sm"
              >
                <span>Open Chrome DevTools</span>
                <ExternalLink className="size-3" />
              </a>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(nodeInspectorUrl)}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-colors"
              >
                Copy Link
              </button>
            </div>
          ) : (
            <div className="text-xs text-[var(--text-muted)] bg-[var(--surface-sunken)] p-2.5 rounded-lg border border-[var(--border-subtle)] font-mono">
              Waiting for inspector WebSocket in output... (Ensure process was started with Debug Mode: Node)
            </div>
          )}
        </div>

        {/* Rust Diagnostics & Backtraces Card */}
        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <span>🦀</span> Rust Diagnostics & Backtrace
            </span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono">RUST_BACKTRACE=full</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Panics and rustc error diagnostics are automatically parsed with file:line jump links.
          </p>

          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {logs
              .filter((l) => l.level === 'error' || l.text.includes('panic') || l.text.includes('error['))
              .slice(-10)
              .map((errLog) => (
                <div
                  key={errLog.id}
                  className="p-2 rounded-lg bg-[var(--surface-sunken)] border border-red-500/20 text-xs font-mono text-red-300 space-y-1"
                >
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {errLog.timestamp.substring(11, 19)}
                  </div>
                  <div className="whitespace-pre-wrap">{errLog.text}</div>
                </div>
              ))}
            {logs.filter((l) => l.level === 'error').length === 0 && (
              <div className="text-xs text-emerald-400 font-medium py-1">
                ✓ No errors or panics reported for this process.
              </div>
            )}
          </div>
        </div>

        {/* Web Live Preview Card */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Globe className="size-4 text-[var(--accent)]" />
              <span>Web Server Preview</span>
            </span>

            {/* Viewport switcher */}
            <div className="flex items-center rounded-lg border border-[var(--border-subtle)] p-0.5 bg-[var(--surface-sunken)]">
              <button
                type="button"
                onClick={() => setDeviceMode('desktop')}
                className={`p-1 rounded ${deviceMode === 'desktop' ? 'bg-[var(--surface-active)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
                title="Desktop (100%)"
              >
                <Laptop className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('tablet')}
                className={`p-1 rounded ${deviceMode === 'tablet' ? 'bg-[var(--surface-active)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
                title="Tablet (768px)"
              >
                <Tablet className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('mobile')}
                className={`p-1 rounded ${deviceMode === 'mobile' ? 'bg-[var(--surface-active)] text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
                title="Mobile (375px)"
              >
                <Smartphone className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-mono bg-[var(--surface-sunken)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
            <span className="text-[var(--accent)] font-medium truncate">{webServerUrl}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIframeKey((k) => k + 1)}
                className="p-1 rounded hover:bg-[var(--surface-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                title="Reload preview"
              >
                <RefreshCw className="size-3" />
              </button>
              <a
                href={webServerUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1 rounded hover:bg-[var(--surface-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                title="Open in external browser"
              >
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>

          {/* Iframe preview container */}
          <div className="flex justify-center bg-[var(--surface-sunken)] rounded-xl border border-[var(--border-subtle)] p-2 min-h-[320px] overflow-hidden">
            <div
              className="transition-all duration-200 h-[380px] rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-white dark:bg-zinc-900 shadow-md"
              style={{
                width: deviceMode === 'mobile' ? '375px' : deviceMode === 'tablet' ? '540px' : '100%',
              }}
            >
              <iframe
                key={iframeKey}
                src={webServerUrl}
                title="Web Preview"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
