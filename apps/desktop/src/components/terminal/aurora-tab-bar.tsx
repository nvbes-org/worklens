import {
  Clock,
  Columns,
  Grid,
  HelpCircle,
  Layers,
  Maximize2,
  PanelRight,
  Plus,
  Rows,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react';
import type { TerminalLayoutMode, TerminalTabConfig } from './types';

interface Props {
  tabs: TerminalTabConfig[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
  layout: TerminalLayoutMode;
  onChangeLayout: (layout: TerminalLayoutMode) => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onToggleZoom: () => void;
  isZoomed: boolean;
  onToggleToolbelt: () => void;
  isToolbeltOpen: boolean;
  onToggleReplay: () => void;
  isReplayOpen: boolean;
  onOpenPalette: () => void;
  onOpenQuickSelect: () => void;
  onOpenHelp: () => void;
}

export function AuroraTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onNewTab,
  onCloseTab,
  layout,
  onChangeLayout,
  onSplitRight,
  onSplitDown,
  onToggleZoom,
  isZoomed,
  onToggleToolbelt,
  isToolbeltOpen,
  onToggleReplay,
  isReplayOpen,
  onOpenPalette,
  onOpenQuickSelect,
  onOpenHelp,
}: Props) {
  return (
    <div className="h-9 px-2 border-b border-white/10 bg-black/60 backdrop-blur-md flex items-center justify-between text-xs text-slate-300 z-20 select-none">
      {/* Left: Brand + Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 mr-2">
        <div className="flex items-center gap-1.5 px-2 py-1 mr-1 text-cyan-400 font-bold font-sans">
          <Terminal className="size-3.5 text-cyan-400" />
          <span className="text-slate-100 hidden sm:inline text-xs font-semibold">AuroraTerm</span>
        </div>

        {/* Tab List */}
        <div className="flex items-center gap-1">
          {tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectTab(tab.id);
                  }
                }}
                onClick={() => onSelectTab(tab.id)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-t-md cursor-pointer transition-all border-b-2 text-[11px] ${
                  isActive
                    ? 'bg-white/[0.08] text-white border-cyan-400 font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border-transparent'
                }`}
              >
                <span>{tab.title || `Terminal ${idx + 1}`}</span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="p-0.5 rounded-full hover:bg-white/20 text-slate-400 hover:text-slate-100 opacity-60 group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={onNewTab}
            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200"
            title="New Tab (⌘T)"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Layout Switchers & Quick Action Tools */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Layout Modes */}
        <div className="hidden md:flex items-center bg-white/[0.04] p-0.5 rounded border border-white/10 mr-1">
          <button
            type="button"
            onClick={() => onChangeLayout('splits')}
            className={`p-1 rounded ${
              layout === 'splits' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Free Splits (⌘⌥1)"
          >
            <Columns className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => onChangeLayout('fat')}
            className={`p-1 rounded ${
              layout === 'fat' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Fat Layout - 70% Top (⌘⌥2)"
          >
            <Rows className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => onChangeLayout('tall')}
            className={`p-1 rounded ${
              layout === 'tall' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Tall Layout - 70% Left (⌘⌥3)"
          >
            <Layers className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => onChangeLayout('grid')}
            className={`p-1 rounded ${
              layout === 'grid' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Grid Layout (⌘⌥4)"
          >
            <Grid className="size-3" />
          </button>
        </div>

        {/* Split Actions */}
        <button
          type="button"
          onClick={onSplitRight}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10"
          title="Split Vertical Right (⌘D)"
        >
          <Columns className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onSplitDown}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10"
          title="Split Horizontal Down (⌘⇧D)"
        >
          <Rows className="size-3.5" />
        </button>

        {/* Zoom active pane */}
        <button
          type="button"
          onClick={onToggleZoom}
          className={`p-1 rounded ${
            isZoomed
              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
          }`}
          title="Toggle Zoom Stack Mode (⌘⇧↵)"
        >
          <Maximize2 className="size-3.5" />
        </button>

        <div className="h-3.5 w-px bg-white/10 mx-0.5" />

        {/* QuickSelect */}
        <button
          type="button"
          onClick={onOpenQuickSelect}
          className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-white/10"
          title="QuickSelect Mode (⌘⇧Space)"
        >
          <Zap className="size-3.5" />
        </button>

        {/* Instant Replay */}
        <button
          type="button"
          onClick={onToggleReplay}
          className={`p-1 rounded ${
            isReplayOpen
              ? 'bg-cyan-500/20 text-cyan-300'
              : 'text-slate-400 hover:text-cyan-300 hover:bg-white/10'
          }`}
          title="Instant Replay Scrubber (⌘⌥R)"
        >
          <Clock className="size-3.5" />
        </button>

        {/* Command Palette */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10"
          title="Command Palette (⌘P)"
        >
          <Sparkles className="size-3.5" />
        </button>

        {/* Toolbelt Toggle */}
        <button
          type="button"
          onClick={onToggleToolbelt}
          className={`p-1 rounded ${
            isToolbeltOpen
              ? 'bg-cyan-500/20 text-cyan-300'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
          }`}
          title="Toggle Toolbelt Drawer (⌘.)"
        >
          <PanelRight className="size-3.5" />
        </button>

        {/* Help Cheatsheet */}
        <button
          type="button"
          onClick={onOpenHelp}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10"
          title="Keyboard Shortcuts Cheatsheet (⌘? / F1)"
        >
          <HelpCircle className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
