import { Columns, CornerDownLeft, Search, Sparkles, Terminal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommandPaletteAction } from './types';

const ACTIONS: CommandPaletteAction[] = [
  {
    id: 'split-right',
    title: 'Split Vertical (Right)',
    subtitle: 'Divide active pane into side-by-side terminals',
    category: 'Splits & Layouts',
    shortcut: '⌘D',
  },
  {
    id: 'split-down',
    title: 'Split Horizontal (Down)',
    subtitle: 'Divide active pane into stacked terminals',
    category: 'Splits & Layouts',
    shortcut: '⌘⇧D',
  },
  {
    id: 'toggle-zoom',
    title: 'Toggle Zoom (Stack Mode)',
    subtitle: 'Maximize active pane to 100% or restore layout',
    category: 'Splits & Layouts',
    shortcut: '⌘⇧↵',
  },
  {
    id: 'layout-splits',
    title: 'Layout: Free Splits',
    subtitle: 'Standard resizable horizontal/vertical split layout',
    category: 'Splits & Layouts',
    shortcut: '⌘⌥1',
  },
  {
    id: 'layout-fat',
    title: 'Layout: Fat (70% Top)',
    subtitle: 'Prominent primary console with bottom helper panes',
    category: 'Splits & Layouts',
    shortcut: '⌘⌥2',
  },
  {
    id: 'layout-tall',
    title: 'Layout: Tall (70% Left)',
    subtitle: 'Wide main terminal with vertical side-car panes',
    category: 'Splits & Layouts',
    shortcut: '⌘⌥3',
  },
  {
    id: 'layout-grid',
    title: 'Layout: 2x2 Grid',
    subtitle: 'Symmetrical balanced quad-terminal layout',
    category: 'Splits & Layouts',
    shortcut: '⌘⌥4',
  },
  {
    id: 'new-tab',
    title: 'New Terminal Tab',
    subtitle: 'Create a fresh terminal workspace tab',
    category: 'Navigation & Tabs',
    shortcut: '⌘T',
  },
  {
    id: 'close-pane',
    title: 'Close Active Pane',
    subtitle: 'Kill active session or close split',
    category: 'Navigation & Tabs',
    shortcut: '⌘W',
  },
  {
    id: 'quickselect',
    title: 'QuickSelect Mode',
    subtitle: 'Overlay 2-letter pills to copy hashes, URLs, and paths',
    category: 'Productivity',
    shortcut: '⌘⇧Space',
  },
  {
    id: 'search',
    title: 'Search Scrollback',
    subtitle: 'Regex and text search through terminal output',
    category: 'Productivity',
    shortcut: '⌘F',
  },
  {
    id: 'instant-replay',
    title: 'Instant Replay',
    subtitle: 'Rewind terminal buffer through time scrubber',
    category: 'Productivity',
    shortcut: '⌘⌥R',
  },
  {
    id: 'toggle-toolbelt',
    title: 'Toggle Toolbelt Drawer',
    subtitle: 'Open history, bookmarks, directories, and jobs',
    category: 'Productivity',
    shortcut: '⌘.',
  },
  {
    id: 'clear-buffer',
    title: 'Clear Terminal Buffer',
    subtitle: 'Reset screen output while preserving shell process',
    category: 'Productivity',
    shortcut: '⌘K',
  },
  {
    id: 'export-markdown',
    title: 'Export Blocks to Markdown',
    subtitle: 'Convert all command output blocks to Markdown',
    category: 'Productivity',
    shortcut: '⌘⇧M',
  },
  {
    id: 'shortcuts-help',
    title: 'Shortcuts Cheatsheet',
    subtitle: 'Show full keyboard shortcut references',
    category: 'Productivity',
    shortcut: '⌘? / F1',
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionId: string) => void;
}

export function AuroraCommandPalette({ isOpen, onClose, onSelectAction }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ACTIONS;
    return ACTIONS.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.subtitle?.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.shortcut?.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filtered[selectedIndex];
      if (current) {
        onSelectAction(current.id);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 animate-in fade-in duration-100">
      <button
        type="button"
        aria-label="Dismiss Command Palette"
        className="fixed inset-0 bg-black/60 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-xl bg-[#090d16]/95 border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col font-sans"
      >
        {/* Search Input Box */}
        <div className="flex items-center px-4 py-3 border-b border-white/10 bg-white/[0.02]">
          <Search className="size-4 text-cyan-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or shortcut (e.g. split, layout, replay)..."
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-400 text-[10px] font-mono">ESC</kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[340px] overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-slate-500">
              No terminal action matching "{query}"
            </div>
          ) : (
            filtered.map((action, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    onSelectAction(action.id);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/15 border border-cyan-500/30 text-white'
                      : 'text-slate-300 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-1.5 rounded-md ${
                        isSelected ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      {action.category === 'Splits & Layouts' ? (
                        <Columns className="size-3.5" />
                      ) : action.category === 'Navigation & Tabs' ? (
                        <Terminal className="size-3.5" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-200">{action.title}</div>
                      {action.subtitle && <div className="text-[11px] text-slate-400">{action.subtitle}</div>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {action.shortcut && (
                      <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-slate-300 text-[10px] font-mono border border-white/10">
                        {action.shortcut}
                      </kbd>
                    )}
                    {isSelected && <CornerDownLeft className="size-3 text-cyan-400" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-white/[0.06] bg-black/40 text-[11px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Dismiss</span>
          </div>
          <span className="text-cyan-400/80 font-mono text-[10px]">AuroraTerm Cockpit</span>
        </div>
      </div>
    </div>
  );
}
