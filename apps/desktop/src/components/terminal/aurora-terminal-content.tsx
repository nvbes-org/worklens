import { AuroraCommandPalette } from './aurora-command-palette';
import { AuroraQuickSelectOverlay } from './aurora-quickselect-overlay';
import { AuroraReplayBar } from './aurora-replay-bar';
import { AuroraSearchOverlay } from './aurora-search-overlay';
import { AuroraShortcutsModal } from './aurora-shortcuts-modal';
import { AuroraSplitContainer } from './aurora-split-container';
import { AuroraToolbelt } from './aurora-toolbelt';
import { useAuroraTerminalContext } from './terminal-context';

export function AuroraTerminalContent() {
  const {
    activeTab,
    handleClosePane,
    handleFocusPane,
    handleSplitRight,
    handleSplitDown,
    handleToggleZoom,
    isZoomed,
    isToolbeltOpen,
    setIsToolbeltOpen,
    isReplayOpen,
    setIsReplayOpen,
    isPaletteOpen,
    setIsPaletteOpen,
    isQuickSelectOpen,
    setIsQuickSelectOpen,
    isSearchOpen,
    setIsSearchOpen,
    isHelpOpen,
    setIsHelpOpen,
    history,
    handleExecuteCommand,
    handlePaletteAction,
  } = useAuroraTerminalContext();

  return (
    <div className="flex flex-col h-full w-full bg-[#090d16] text-slate-100 font-mono text-[13px] overflow-hidden select-text relative">
      {/* Main Terminal Grid + Toolbelt Container */}
      <div className="flex-1 flex w-full h-full overflow-hidden relative">
        <AuroraSplitContainer
          panes={activeTab?.panes || []}
          activePaneId={activeTab?.activePaneId || ''}
          layout={activeTab?.layout || 'splits'}
          onFocusPane={handleFocusPane}
          onClosePane={handleClosePane}
          onSplitRight={handleSplitRight}
          onSplitDown={handleSplitDown}
          onToggleZoom={handleToggleZoom}
          isZoomed={isZoomed}
        />

        {/* Toolbelt Collapsible Side Drawer */}
        <AuroraToolbelt
          isOpen={isToolbeltOpen}
          onClose={() => setIsToolbeltOpen(false)}
          onExecuteCommand={handleExecuteCommand}
          history={history}
        />
      </div>

      {/* Instant Replay Bottom Bar */}
      <AuroraReplayBar isOpen={isReplayOpen} onClose={() => setIsReplayOpen(false)} />

      {/* Overlays */}
      <AuroraCommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onSelectAction={handlePaletteAction}
      />

      <AuroraQuickSelectOverlay
        isOpen={isQuickSelectOpen}
        onClose={() => setIsQuickSelectOpen(false)}
        onSelectHint={(h) => console.log('Selected QuickSelect hint:', h)}
      />

      <AuroraSearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      <AuroraShortcutsModal open={isHelpOpen} onOpenChange={setIsHelpOpen} />
    </div>
  );
}
