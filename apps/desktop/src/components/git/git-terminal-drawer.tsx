import { ChevronDown, ChevronUp, Clock, Copy, CornerDownLeft, Terminal, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

interface OutputEntry {
  id: string;
  command: string;
  output: string;
  success: boolean;
  timestamp: string;
  durationMs: number;
}

const QUICK_COMMANDS = [
  'git status -s',
  'git branch -vv',
  'git remote -v',
  'git log --oneline -n 10',
  'git diff --stat',
  'git clean -fd',
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function GitTerminalDrawer({ isOpen, onClose, onToggle }: Props) {
  const { repo } = useSession();
  const git = useGit();
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<OutputEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function runCommand(cmdToRun: string) {
    const trimmed = cmdToRun.trim();
    if (!repo || !trimmed || loading) return;

    setLoading(true);
    const start = performance.now();
    try {
      const res = await query<{ success: boolean; output: string }>('git_action', repo.path, {
        action: 'raw_command',
        command: trimmed,
      });
      const durationMs = Math.round(performance.now() - start);
      setHistory((prev) => [
        {
          id: Math.random().toString(36).slice(2),
          command: trimmed,
          output: res.output || '(No output - command succeeded)',
          success: true,
          timestamp: new Date().toLocaleTimeString(),
          durationMs,
        },
        ...prev,
      ]);
      setCommand('');
      setHistoryIndex(-1);
      // Auto-refresh Git state if command may have altered repo
      if (
        trimmed.includes('checkout') ||
        trimmed.includes('branch') ||
        trimmed.includes('pull') ||
        trimmed.includes('fetch') ||
        trimmed.includes('commit') ||
        trimmed.includes('reset') ||
        trimmed.includes('clean') ||
        trimmed.includes('stash')
      ) {
        void git.refetch();
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      setHistory((prev) => [
        {
          id: Math.random().toString(36).slice(2),
          command: trimmed,
          output: err instanceof Error ? err.message : String(err),
          success: false,
          timestamp: new Date().toLocaleTimeString(),
          durationMs,
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void runCommand(command);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = Math.min(history.length - 1, historyIndex + 1);
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex].command);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setCommand('');
      } else {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setCommand(history[nextIndex].command);
      }
    }
  }

  function copyOutput(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-3 right-4 z-40">
        <Button
          variant="outline"
          size="sm"
          onClick={onToggle}
          className="shadow-lg bg-card/95 backdrop-blur-xs text-xs gap-1.5 h-8 border-primary/30 hover:border-primary"
        >
          <Terminal className="size-3.5 text-primary" />
          <span>Git Console</span>
          <ChevronUp className="size-3 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t shadow-2xl flex flex-col h-80 transition-all animate-in slide-in-from-bottom duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40 select-none">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Interactive Git Console</span>
          <span className="text-[10px] text-muted-foreground">
            Execute any git command safely in current repository
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistory([])}
              className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="size-3 mr-1" /> Clear
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Quick Suggestions Chips */}
      <div className="flex items-center gap-1.5 px-4 py-1.5 border-b bg-background/50 overflow-x-auto text-[11px]">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0 mr-1">
          Quick:
        </span>
        {QUICK_COMMANDS.map((qc) => (
          <button
            key={qc}
            type="button"
            onClick={() => void runCommand(qc)}
            disabled={loading}
            className="px-2 py-0.5 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] font-mono whitespace-nowrap transition-colors"
          >
            {qc}
          </button>
        ))}
      </div>

      {/* History Log */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs bg-black/90 text-zinc-200">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs">
            <Terminal className="size-8 mb-2 opacity-40" />
            <p>Ready for Git commands. Type a command below or click a quick shortcut above.</p>
            <p className="text-[10px] mt-1 text-zinc-600">Use `↑` / `↓` keys to navigate command history.</p>
          </div>
        ) : (
          history.map((entry) => (
            <div key={entry.id} className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-zinc-800 pb-1">
                <div className="flex items-center gap-1.5">
                  <span className={entry.success ? 'text-emerald-400' : 'text-red-400'}>
                    {entry.success ? '●' : '✕'}
                  </span>
                  <span className="text-zinc-100 font-bold">$ {entry.command}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-0.5">
                    <Clock className="size-2.5" /> {entry.durationMs}ms
                  </span>
                  <span>{entry.timestamp}</span>
                  <button
                    type="button"
                    title="Copy output"
                    onClick={() => copyOutput(entry.id, entry.output)}
                    className="hover:text-zinc-200 transition-colors flex items-center gap-1"
                  >
                    {copiedId === entry.id ? (
                      <span className="text-emerald-400 text-[10px]">Copied!</span>
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
              </div>
              <pre
                className={`whitespace-pre-wrap text-xs p-2 rounded ${
                  entry.success ? 'bg-zinc-900/60 text-zinc-300' : 'bg-red-950/30 text-red-300'
                }`}
              >
                {entry.output}
              </pre>
            </div>
          ))
        )}
      </div>

      {/* Command Input Bar */}
      <div className="flex items-center gap-2 p-2.5 border-t bg-card">
        <span className="font-mono text-xs font-bold text-primary pl-2 select-none">$ git</span>
        <input
          type="text"
          placeholder="status, branch -a, log -n 5, checkout <branch>, etc..."
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          className="flex-1 px-3 py-1.5 rounded-md border bg-background font-mono text-xs focus:outline-hidden focus:ring-2 focus:ring-primary/40"
        />
        <Button
          variant="default"
          size="sm"
          onClick={() => void runCommand(command)}
          disabled={loading || !command.trim()}
          className="h-8 text-xs gap-1"
        >
          <span>Run</span>
          <CornerDownLeft className="size-3" />
        </Button>
      </div>
    </div>
  );
}
