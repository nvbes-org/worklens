import { invoke, isTauri } from '@tauri-apps/api/core';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Columns, Maximize2, Rows, Terminal as TerminalIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { TerminalPaneConfig } from './types';

interface Props {
  pane: TerminalPaneConfig;
  isActive: boolean;
  onFocus: () => void;
  onClose?: () => void;
  onSplitRight?: () => void;
  onSplitDown?: () => void;
  onToggleZoom?: () => void;
  isZoomed?: boolean;
}

export function AuroraPane({
  pane,
  isActive,
  onFocus,
  onClose,
  onSplitRight,
  onSplitDown,
  onToggleZoom,
  isZoomed,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [currentCwd, setCurrentCwd] = useState<string | undefined>(pane.cwd);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      lineHeight: 1.25,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      linkHandler: {
        activate: (_event, text) => {
          if (text) {
            window.open(text, '_blank');
          }
        },
      },
      theme: {
        background: '#090d16',
        foreground: '#e6edf3',
        cursor: '#38bdf8',
        cursorAccent: '#090d16',
        selectionBackground: 'rgba(56, 189, 248, 0.3)',
        selectionInactiveBackground: 'rgba(56, 189, 248, 0.15)',
        black: '#090d16',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#38bdf8',
        white: '#f1f5f9',
        brightBlack: '#64748b',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fde047',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#7dd3fc',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    // OSC 0 and 2: Title change
    term.onTitleChange((title) => {
      if (title && title.trim().length > 0) {
        setCustomTitle(title);
      }
    });

    // OSC 7: Current Working Directory
    term.parser.registerOscHandler(7, (data) => {
      try {
        let path = data;
        if (path.startsWith('file://')) {
          const url = new URL(path);
          path = decodeURIComponent(url.pathname);
        }
        if (path) {
          setCurrentCwd(path);
        }
      } catch {}
      return true;
    });

    // OSC 52: System Clipboard
    term.parser.registerOscHandler(52, (data) => {
      const parts = data.split(';');
      if (parts.length >= 2) {
        const b64 = parts[1].trim();
        if (b64 && b64 !== '?') {
          try {
            const text = atob(b64);
            void navigator.clipboard.writeText(text);
            return true;
          } catch {}
        }
      }
      return false;
    });

    // OSC 9: Notification
    term.parser.registerOscHandler(9, (data) => {
      if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          new Notification('AuroraTerm', { body: data });
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then((p) => {
            if (p === 'granted') new Notification('AuroraTerm', { body: data });
          });
        }
      }
      return true;
    });

    // OSC 777: Notification (notify;title;body)
    term.parser.registerOscHandler(777, (data) => {
      const parts = data.split(';');
      if (parts[0] === 'notify' && parts.length >= 3) {
        const title = parts[1];
        const body = parts.slice(2).join(';');
        if (typeof Notification !== 'undefined') {
          if (Notification.permission === 'granted') {
            new Notification(title, { body });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then((p) => {
              if (p === 'granted') new Notification(title, { body });
            });
          }
        }
      }
      return true;
    });

    // OSC 1337: iTerm2 protocol
    term.parser.registerOscHandler(1337, (data) => {
      if (data.startsWith('CurrentDir=')) {
        const dir = data.substring('CurrentDir='.length);
        if (dir) setCurrentCwd(dir);
      }
      return true;
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    if (isActive) {
      term.focus();
    }

    if (!isTauri()) {
      term.writeln('\x1b[1;36m⚡ AuroraTerm Native Engine (Web preview)\x1b[0m');
      term.write('\r\n\x1b[32muser@worklens\x1b[0m:\x1b[34m~/project\x1b[0m$ ');
      return () => term.dispose();
    }

    let active = true;
    let sid: string | null = null;

    async function startPty() {
      try {
        const rows = Math.max(10, term.rows || 24);
        const cols = Math.max(20, term.cols || 80);

        const id = await invoke<string>('terminal_spawn', {
          cwd: pane.cwd,
          rows,
          cols,
        });

        if (!active) return;
        sid = id;
        setSessionId(id);

        term.onData((data) => {
          if (!sid) return;
          const bytes = Array.from(new TextEncoder().encode(data));
          void invoke('terminal_write', { sessionId: sid, data: bytes });
        });

        while (active) {
          try {
            const bytes = await invoke<number[]>('terminal_read', { sessionId: id });
            if (bytes && bytes.length > 0) {
              term.write(new Uint8Array(bytes));
            }
          } catch {
            break;
          }
          await new Promise((r) => setTimeout(r, 25));
        }
      } catch (err) {
        if (active) {
          term.writeln(`\r\n\x1b[31m[PTY Error: ${String(err)}]\x1b[0m`);
        }
      }
    }

    void startPty();

    const resizeObserver = new ResizeObserver(() => {
      if (!fitAddonRef.current || !termRef.current) return;
      try {
        fitAddonRef.current.fit();
        if (sid) {
          void invoke('terminal_resize', {
            sessionId: sid,
            rows: termRef.current.rows,
            cols: termRef.current.cols,
          });
        }
      } catch {}
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      active = false;
      resizeObserver.disconnect();
      if (sid) {
        void invoke('terminal_kill', { sessionId: sid });
      }
      term.dispose();
    };
  }, [pane.cwd]);

  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus();
    }
  }, [isActive]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!sessionId || !termRef.current) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // In web/desktop, extract path or name with escaped space
      const paths = files
        .map((f) => {
          const path = (f as { path?: string }).path || f.name;
          return `"${path.replace(/"/g, '\\"')}" `;
        })
        .join('');
      const bytes = Array.from(new TextEncoder().encode(paths));
      void invoke('terminal_write', { sessionId, data: bytes });
      termRef.current.focus();
    }
  }

  return (
    <section
      aria-label={pane.title}
      onFocus={onFocus}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onFocus();
      }}
      onClick={onFocus}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-testid="aurora-pane"
      className={`aurora-pane relative flex flex-col h-full bg-[#090d16] overflow-hidden transition-all duration-150 ${
        isActive ? 'ring-1 ring-cyan-500/50 shadow-[0_0_12px_rgba(56,189,248,0.08)]' : 'opacity-85'
      }`}
    >
      {/* Background Watermark Badge */}
      {pane.branch && (
        <div className="absolute top-10 right-4 pointer-events-none text-white/[0.02] text-4xl font-black uppercase select-none tracking-widest z-0">
           {pane.branch}
        </div>
      )}

      {/* Pane Top Sub-Bar */}
      <div className="h-6 px-2 border-b border-white/[0.06] bg-black/30 flex items-center justify-between text-[10px] text-slate-400 select-none z-10">
        <div className="flex items-center gap-1.5 truncate">
          <TerminalIcon className={`size-2.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
          <span className="font-semibold text-slate-300">{customTitle || pane.title}</span>
          {(currentCwd || pane.cwd) && (
            <span className="text-slate-500 truncate max-w-[180px] font-mono">{currentCwd || pane.cwd}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onSplitRight && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSplitRight();
              }}
              className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200"
              title="Split Right"
            >
              <Columns className="size-2.5" />
            </button>
          )}
          {onSplitDown && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSplitDown();
              }}
              className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200"
              title="Split Down"
            >
              <Rows className="size-2.5" />
            </button>
          )}
          {onToggleZoom && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleZoom();
              }}
              className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200"
              title={isZoomed ? 'Restore Layout' : 'Zoom Pane'}
            >
              <Maximize2 className="size-2.5" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-0.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
              title="Close Pane"
            >
              <X className="size-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Pane Canvas Container */}
      <div ref={containerRef} className="flex-1 w-full h-full p-2 overflow-hidden z-10 cursor-text" />
    </section>
  );
}
