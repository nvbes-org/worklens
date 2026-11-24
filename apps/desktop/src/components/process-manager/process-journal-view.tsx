import { Copy, Download, ExternalLink, Filter, Globe, Send, Terminal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { LogLevel, ProcessInfo, ProcessJournalEntry } from '@worklens/contracts';

interface ProcessJournalViewProps {
  process: ProcessInfo | null;
  logs: ProcessJournalEntry[];
  isLoading: boolean;
  onSendInput: (text: string) => void;
  onClearLogs: () => void;
  onOpenUrl?: (url: string) => void;
  onOpenFile?: (file: string, line?: number) => void;
}

export function ProcessJournalView({
  process,
  logs,
  isLoading,
  onSendInput,
  onClearLogs,
  onOpenUrl,
  onOpenFile,
}: ProcessJournalViewProps) {
  const [inputVal, setInputVal] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel | 'all'>('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal) return;
    onSendInput(inputVal + '\n');
    setInputVal('');
  };

  const filteredLogs = logs.filter((entry) => {
    if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
    if (search && !entry.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCopy = () => {
    const text = filteredLogs.map((l) => `[${l.timestamp}] [${l.level}] ${l.text}`).join('\n');
    void navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    const text = filteredLogs.map((l) => `[${l.timestamp}] [${l.level}] ${l.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${process?.name || 'process'}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!process) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center border border-[var(--border-subtle)] rounded-xl bg-[var(--surface-subtle)] text-[var(--text-muted)]">
        <Terminal className="size-8 mb-2 opacity-40" />
        <p className="text-sm font-medium">Select a process to view its live journal</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">Logs, outputs and terminal input will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-xs">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-[var(--accent)]" />
          <span className="font-semibold text-[var(--text-primary)]">{process.name}</span>
          <span className="text-[10px] text-[var(--text-muted)] font-mono">PID {process.pid}</span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-[var(--border-subtle)] p-0.5 bg-[var(--surface-sunken)]">
            {(['all', 'error', 'warn', 'info'] as const).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setLevelFilter(lvl)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors ${
                  levelFilter === lvl
                    ? 'bg-[var(--surface-active)] text-[var(--text-primary)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {lvl.toUpperCase()}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter logs..."
            className="w-28 px-2 py-0.5 text-xs rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-primary)] focus:outline-none"
          />

          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            title="Copy logs"
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            title="Download .log file"
          >
            <Download className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onClearLogs}
            className="p-1 rounded text-[var(--text-muted)] hover:text-red-400"
            title="Clear logs"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Logs Streaming Area */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1 select-text">
        {isLoading && logs.length === 0 ? (
          <div className="text-[var(--text-muted)]">Loading log buffer...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-[var(--text-muted)] py-4 text-center">No logs recorded yet.</div>
        ) : (
          filteredLogs.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-start gap-2.5 py-0.5 px-1 rounded hover:bg-white/[0.02] ${
                entry.level === 'error'
                  ? 'text-red-400 bg-red-500/5'
                  : entry.level === 'warn'
                  ? 'text-amber-400'
                  : entry.stream === 'system'
                  ? 'text-blue-400 italic'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              <span className="text-[10px] text-[var(--text-muted)] shrink-0 select-none">
                {entry.timestamp.substring(11, 19)}
              </span>
              <span
                className={`text-[9px] px-1 rounded uppercase font-semibold shrink-0 select-none ${
                  entry.level === 'error'
                    ? 'bg-red-500/20 text-red-300'
                    : entry.level === 'warn'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-white/5 text-[var(--text-muted)]'
                }`}
              >
                {entry.level}
              </span>
              <div className="flex-1 break-all whitespace-pre-wrap">
                <span>{entry.text}</span>

                {/* Parsed Links (URLs or files) */}
                {entry.parsedLinks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {entry.parsedLinks.map((link, idx) =>
                      link.kind === 'url' ? (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => onOpenUrl?.(link.target)}
                          className="inline-flex items-center gap-1 text-[11px] font-sans px-2 py-0.5 rounded border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors"
                        >
                          <Globe className="size-3" />
                          <span>{link.label}</span>
                          <ExternalLink className="size-2.5" />
                        </button>
                      ) : (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => onOpenFile?.(link.target, link.line ?? undefined)}
                          className="inline-flex items-center gap-1 text-[11px] font-sans px-2 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors"
                        >
                          <span>📄 {link.label}</span>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Terminal Input Bar (Interactive stdin) */}
      <form onSubmit={handleSend} className="flex items-center gap-2 p-2 border-t border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
        <span className="text-xs text-[var(--text-muted)] font-mono pl-1 select-none">&gt;</span>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder={process.status === 'running' ? 'Send terminal input (stdin)...' : 'Process is not running'}
          disabled={process.status !== 'running'}
          className="flex-1 text-xs font-mono bg-transparent text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!inputVal || process.status !== 'running'}
          className="p-1.5 rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-30 transition-opacity"
          title="Send input"
        >
          <Send className="size-3.5" />
        </button>
      </form>
    </div>
  );
}
