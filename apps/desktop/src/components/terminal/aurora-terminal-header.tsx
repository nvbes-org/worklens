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
  X,
  Zap,
} from 'lucide-react';
import { useAuroraTerminalContext } from './terminal-context';

export function AuroraTerminalHeaderTabs() {
  const { tabs, activeTabId, setActiveTabId, handleNewTab, handleCloseTab } = useAuroraTerminalContext();

  return (
    <div
      data-testid="terminal-header-tabs"
      className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[360px]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            data-testid={`terminal-tab-${tab.id}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTabId(tab.id);
              }
            }}
            onClick={() => setActiveTabId(tab.id)}
            className={`group flex items-center gap-1.5 px-2 py-0.5 rounded-md cursor-pointer transition-all text-[11px] font-sans ${
              isActive
                ? 'bg-white/15 text-white font-medium shadow-xs border border-white/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] border border-transparent'
            }`}
          >
            <span className="truncate max-w-[90px]">{tab.title || `Terminal ${idx + 1}`}</span>
            {tabs.length > 1 && (
              <button
                type="button"
                data-testid={`terminal-close-tab-${tab.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                className="p-0.5 rounded-full hover:bg-white/20 text-slate-400 hover:text-slate-100 opacity-60 group-hover:opacity-100 transition-opacity"
                title="Fermer l'onglet"
                aria-label="Fermer l'onglet"
              >
                <X className="size-2.5" />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        data-testid="terminal-btn-new-tab"
        onClick={handleNewTab}
        className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
        title="Nouvel onglet (⌘T)"
        aria-label="Nouvel onglet"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

export function AuroraTerminalHeaderActions() {
  const {
    activeTab,
    handleChangeLayout,
    handleSplitRight,
    handleSplitDown,
    handleToggleZoom,
    isZoomed,
    isToolbeltOpen,
    setIsToolbeltOpen,
    isReplayOpen,
    setIsReplayOpen,
    setIsPaletteOpen,
    setIsQuickSelectOpen,
    setIsHelpOpen,
  } = useAuroraTerminalContext();

  const layout = activeTab?.layout ?? 'splits';

  return (
    <div
      data-testid="terminal-header-actions"
      className="flex items-center gap-0.5 shrink-0"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Layout Modes */}
      <div className="hidden lg:flex items-center bg-white/[0.04] p-0.5 rounded border border-white/10 mr-0.5">
        <button
          type="button"
          data-testid="terminal-layout-splits"
          onClick={() => handleChangeLayout('splits')}
          className={`p-1 rounded transition-colors ${
            layout === 'splits' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Free Splits (⌘⌥1)"
          aria-label="Disposition splits libres"
        >
          <Columns className="size-3" />
        </button>
        <button
          type="button"
          data-testid="terminal-layout-fat"
          onClick={() => handleChangeLayout('fat')}
          className={`p-1 rounded transition-colors ${
            layout === 'fat' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Fat Layout - 70% Top (⌘⌥2)"
          aria-label="Disposition horizontale"
        >
          <Rows className="size-3" />
        </button>
        <button
          type="button"
          data-testid="terminal-layout-tall"
          onClick={() => handleChangeLayout('tall')}
          className={`p-1 rounded transition-colors ${
            layout === 'tall' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Tall Layout - 70% Left (⌘⌥3)"
          aria-label="Disposition verticale"
        >
          <Layers className="size-3" />
        </button>
        <button
          type="button"
          data-testid="terminal-layout-grid"
          onClick={() => handleChangeLayout('grid')}
          className={`p-1 rounded transition-colors ${
            layout === 'grid' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Grid Layout (⌘⌥4)"
          aria-label="Disposition grille"
        >
          <Grid className="size-3" />
        </button>
      </div>

      {/* Split Actions */}
      <button
        type="button"
        data-testid="terminal-btn-split-right"
        onClick={handleSplitRight}
        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
        title="Split Vertical Right (⌘D)"
        aria-label="Séparer verticalement à droite"
      >
        <Columns className="size-3.5" />
      </button>
      <button
        type="button"
        data-testid="terminal-btn-split-down"
        onClick={handleSplitDown}
        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
        title="Split Horizontal Down (⌘⇧D)"
        aria-label="Séparer horizontalement en bas"
      >
        <Rows className="size-3.5" />
      </button>

      {/* Zoom active pane */}
      <button
        type="button"
        data-testid="terminal-btn-zoom"
        onClick={handleToggleZoom}
        className={`p-1 rounded transition-colors ${
          isZoomed
            ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
        }`}
        title="Toggle Zoom Stack Mode (⌘⇧↵)"
        aria-label="Agrandir le volet actif"
      >
        <Maximize2 className="size-3.5" />
      </button>

      <div className="h-3 w-px bg-white/10 mx-0.5" />

      {/* QuickSelect */}
      <button
        type="button"
        data-testid="terminal-btn-quickselect"
        onClick={() => setIsQuickSelectOpen(true)}
        className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-white/10 transition-colors"
        title="QuickSelect Mode (⌘⇧Space)"
        aria-label="Mode sélection rapide"
      >
        <Zap className="size-3.5" />
      </button>

      {/* Instant Replay */}
      <button
        type="button"
        data-testid="terminal-btn-replay"
        onClick={() => setIsReplayOpen((v) => !v)}
        className={`p-1 rounded transition-colors ${
          isReplayOpen
            ? 'bg-cyan-500/20 text-cyan-300'
            : 'text-slate-400 hover:text-cyan-300 hover:bg-white/10'
        }`}
        title="Instant Replay Scrubber (⌘⌥R)"
        aria-label="Relecture instantanée"
      >
        <Clock className="size-3.5" />
      </button>

      {/* Command Palette */}
      <button
        type="button"
        data-testid="terminal-btn-palette"
        onClick={() => setIsPaletteOpen(true)}
        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
        title="Command Palette (⌘P)"
        aria-label="Palette de commandes"
      >
        <Sparkles className="size-3.5" />
      </button>

      {/* Toolbelt Toggle */}
      <button
        type="button"
        data-testid="terminal-btn-toolbelt"
        onClick={() => setIsToolbeltOpen((v) => !v)}
        className={`p-1 rounded transition-colors ${
          isToolbeltOpen
            ? 'bg-cyan-500/20 text-cyan-300'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
        }`}
        title="Toggle Toolbelt Drawer (⌘.)"
        aria-label="Panneau d'outils latéral"
      >
        <PanelRight className="size-3.5" />
      </button>

      {/* Help Cheatsheet */}
      <button
        type="button"
        data-testid="terminal-btn-help"
        onClick={() => setIsHelpOpen(true)}
        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
        title="Keyboard Shortcuts Cheatsheet (⌘? / F1)"
        aria-label="Aide raccourcis clavier"
      >
        <HelpCircle className="size-3.5" />
      </button>
    </div>
  );
}
