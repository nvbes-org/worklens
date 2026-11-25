import { createContext, type ReactNode, useContext } from 'react';
import type { WindowInstance } from '../window-manager/types';
import type { HistoryEntry, TerminalLayoutMode, TerminalTabConfig } from './types';
import { useAuroraTerminal } from './use-aurora-terminal';
import { useTerminalShortcuts } from './use-terminal-shortcuts';

export interface AuroraTerminalContextValue {
  tabs: TerminalTabConfig[];
  activeTab: TerminalTabConfig;
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  handleNewTab: () => void;
  handleCloseTab: (id: string) => void;
  handleSplitRight: () => void;
  handleSplitDown: () => void;
  handleClosePane: (id: string) => void;
  handleFocusPane: (id: string) => void;
  handleChangeLayout: (layout: TerminalLayoutMode) => void;
  handleToggleZoom: () => void;
  isZoomed: boolean;
  isPaletteOpen: boolean;
  setIsPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isQuickSelectOpen: boolean;
  setIsQuickSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isSearchOpen: boolean;
  setIsSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isReplayOpen: boolean;
  setIsReplayOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isToolbeltOpen: boolean;
  setIsToolbeltOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isHelpOpen: boolean;
  setIsHelpOpen: React.Dispatch<React.SetStateAction<boolean>>;
  history: HistoryEntry[];
  handleExecuteCommand: (cmd: string) => void;
  handlePaletteAction: (actionId: string) => void;
}

const AuroraTerminalContext = createContext<AuroraTerminalContextValue | null>(null);

export function useAuroraTerminalContext(): AuroraTerminalContextValue {
  const ctx = useContext(AuroraTerminalContext);
  if (!ctx) {
    throw new Error('useAuroraTerminalContext must be used within an AuroraTerminalProvider');
  }
  return ctx;
}

export function useOptionalAuroraTerminalContext(): AuroraTerminalContextValue | null {
  return useContext(AuroraTerminalContext);
}

interface AuroraTerminalProviderProps {
  instance: WindowInstance;
  children: ReactNode;
}

export function AuroraTerminalProvider({ instance, children }: AuroraTerminalProviderProps) {
  const terminal = useAuroraTerminal(instance);

  useTerminalShortcuts({
    onTogglePalette: () => terminal.setIsPaletteOpen((v) => !v),
    onToggleQuickSelect: () => terminal.setIsQuickSelectOpen((v) => !v),
    onToggleSearch: () => terminal.setIsSearchOpen((v) => !v),
    onToggleReplay: () => terminal.setIsReplayOpen((v) => !v),
    onToggleToolbelt: () => terminal.setIsToolbeltOpen((v) => !v),
    onSplitRight: terminal.handleSplitRight,
    onSplitDown: terminal.handleSplitDown,
    onToggleZoom: terminal.handleToggleZoom,
    onNewTab: terminal.handleNewTab,
    onCloseCurrent: () => terminal.handleClosePane(terminal.activeTab.activePaneId),
    onToggleHelp: () => terminal.setIsHelpOpen((v) => !v),
    onSelectTabByIndex: (idx) => {
      if (terminal.tabs[idx]) terminal.setActiveTabId(terminal.tabs[idx].id);
    },
  });

  return (
    <AuroraTerminalContext.Provider value={terminal}>
      {children}
    </AuroraTerminalContext.Provider>
  );
}
