import { useEffect } from 'react';

interface TerminalShortcutsProps {
  onTogglePalette: () => void;
  onToggleQuickSelect: () => void;
  onToggleSearch: () => void;
  onToggleReplay: () => void;
  onToggleToolbelt: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onToggleZoom: () => void;
  onNewTab: () => void;
  onCloseCurrent: () => void;
  onToggleHelp: () => void;
  onSelectTabByIndex?: (idx: number) => void;
  onFocusNextPane?: () => void;
  onFocusPrevPane?: () => void;
  isEnabled?: boolean;
}

export function useTerminalShortcuts({
  onTogglePalette,
  onToggleQuickSelect,
  onToggleSearch,
  onToggleReplay,
  onToggleToolbelt,
  onSplitRight,
  onSplitDown,
  onToggleZoom,
  onNewTab,
  onCloseCurrent,
  onToggleHelp,
  onSelectTabByIndex,
  onFocusNextPane,
  onFocusPrevPane,
  isEnabled = true,
}: TerminalShortcutsProps) {
  useEffect(() => {
    if (!isEnabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // ⌘ + P : Command Palette
      if (isCmdOrCtrl && !e.shiftKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        onTogglePalette();
        return;
      }

      // ⌘ + ⇧ + Space : QuickSelect
      if (isCmdOrCtrl && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        onToggleQuickSelect();
        return;
      }

      // ⌘ + F : Search Overlay
      if (isCmdOrCtrl && !e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        onToggleSearch();
        return;
      }

      // ⌘ + ⌥ + R : Instant Replay
      if (isCmdOrCtrl && e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        onToggleReplay();
        return;
      }

      // ⌘ + . : Toggle Toolbelt
      if (isCmdOrCtrl && e.key === '.') {
        e.preventDefault();
        onToggleToolbelt();
        return;
      }

      // ⌘ + D : Split Right
      if (isCmdOrCtrl && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        onSplitRight();
        return;
      }

      // ⌘ + ⇧ + D : Split Down
      if (isCmdOrCtrl && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        onSplitDown();
        return;
      }

      // ⌘ + ⇧ + Enter : Toggle Zoom
      if (isCmdOrCtrl && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        onToggleZoom();
        return;
      }

      // ⌘ + T : New Tab
      if (isCmdOrCtrl && !e.shiftKey && !e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        onNewTab();
        return;
      }

      // ⌘ + W : Close Active Pane / Tab
      if (isCmdOrCtrl && !e.shiftKey && !e.altKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        onCloseCurrent();
        return;
      }

      // F1 or ⌘ + ? / ⌘ + / : Help Cheatsheet
      if (e.key === 'F1' || (isCmdOrCtrl && (e.key === '?' || e.key === '/'))) {
        e.preventDefault();
        onToggleHelp();
        return;
      }

      // ⌘ + 1..9 : Switch Tabs
      if (isCmdOrCtrl && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        onSelectTabByIndex?.(index);
        return;
      }

      // Option + Arrow keys : Switch pane focus
      if (e.altKey && !isCmdOrCtrl && !e.shiftKey) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          onFocusNextPane?.();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          onFocusPrevPane?.();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isEnabled,
    onTogglePalette,
    onToggleQuickSelect,
    onToggleSearch,
    onToggleReplay,
    onToggleToolbelt,
    onSplitRight,
    onSplitDown,
    onToggleZoom,
    onNewTab,
    onCloseCurrent,
    onToggleHelp,
    onSelectTabByIndex,
    onFocusNextPane,
    onFocusPrevPane,
  ]);
}
