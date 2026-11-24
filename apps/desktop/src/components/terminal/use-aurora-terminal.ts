import { useCallback, useState } from 'react';
import type { WindowInstance } from '../window-manager/types';
import type { HistoryEntry, TerminalLayoutMode, TerminalPaneConfig, TerminalTabConfig } from './types';

export function useAuroraTerminal(instance: WindowInstance) {
  const initialCwd = (instance.data.cwd as string) || (instance.data.repository as string) || undefined;
  const branch = (instance.data.branch as string) || undefined;

  const initialTabs: TerminalTabConfig[] = (instance.data.tabs as TerminalTabConfig[])?.length
    ? (instance.data.tabs as TerminalTabConfig[])
    : [
        {
          id: 'tab-1',
          title: 'zsh',
          layout: 'splits',
          activePaneId: 'pane-1',
          panes: [
            {
              id: 'pane-1',
              title: 'zsh',
              cwd: initialCwd,
              branch,
              isActive: true,
            },
          ],
        },
      ];

  const [tabs, setTabsInternal] = useState<TerminalTabConfig[]>(initialTabs);

  const setTabs = useCallback(
    (updater: React.SetStateAction<TerminalTabConfig[]>) => {
      setTabsInternal((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        instance.data.tabs = next;
        return next;
      });
    },
    [instance.data],
  );

  const [activeTabId, setActiveTabId] = useState(tabs[0]?.id || 'tab-1');

  // Modals and Overlays State
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isQuickSelectOpen, setIsQuickSelectOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isReplayOpen, setIsReplayOpen] = useState(false);
  const [isToolbeltOpen, setIsToolbeltOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // History entries
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      id: 'h1',
      command: 'cargo check --workspace',
      cwd: initialCwd || '~/project',
      timestamp: Date.now() - 1000 * 60 * 2,
      exitCode: 0,
      durationMs: 420,
    },
    {
      id: 'h2',
      command: 'git status',
      cwd: initialCwd || '~/project',
      timestamp: Date.now() - 1000 * 60 * 8,
      exitCode: 0,
      durationMs: 45,
    },
  ]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Tab Operations
  const handleNewTab = useCallback(() => {
    const nextTabId = `tab-${Date.now()}`;
    const nextPaneId = `pane-${Date.now()}`;
    const newTab: TerminalTabConfig = {
      id: nextTabId,
      title: `terminal ${tabs.length + 1}`,
      layout: 'splits',
      activePaneId: nextPaneId,
      panes: [
        {
          id: nextPaneId,
          title: 'zsh',
          cwd: initialCwd,
          branch,
          isActive: true,
        },
      ],
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(nextTabId);
  }, [tabs.length, initialCwd, branch]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabId);
        if (remaining.length === 0) return prev;
        return remaining;
      });
      setActiveTabId((current) => {
        if (current === tabId) {
          const remaining = tabs.filter((t) => t.id !== tabId);
          return remaining[0]?.id || current;
        }
        return current;
      });
    },
    [tabs],
  );

  // Pane Operations
  const handleSplitRight = useCallback(() => {
    const newPaneId = `pane-${Date.now()}`;
    const newPane: TerminalPaneConfig = {
      id: newPaneId,
      title: 'split right',
      cwd: initialCwd,
      branch,
      isActive: true,
    };
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        return {
          ...tab,
          activePaneId: newPaneId,
          panes: [...tab.panes.map((p) => ({ ...p, isActive: false })), newPane],
        };
      }),
    );
  }, [activeTabId, initialCwd, branch]);

  const handleSplitDown = useCallback(() => {
    const newPaneId = `pane-${Date.now()}`;
    const newPane: TerminalPaneConfig = {
      id: newPaneId,
      title: 'split down',
      cwd: initialCwd,
      branch,
      isActive: true,
    };
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab;
        return {
          ...tab,
          activePaneId: newPaneId,
          panes: [...tab.panes.map((p) => ({ ...p, isActive: false })), newPane],
        };
      }),
    );
  }, [activeTabId, initialCwd, branch]);

  const handleClosePane = useCallback(
    (paneId: string) => {
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== activeTabId) return tab;
          const nextPanes = tab.panes.filter((p) => p.id !== paneId);
          if (nextPanes.length === 0) return tab;
          const nextActiveId = tab.activePaneId === paneId ? nextPanes[0].id : tab.activePaneId;
          return {
            ...tab,
            activePaneId: nextActiveId,
            panes: nextPanes.map((p) => ({ ...p, isActive: p.id === nextActiveId })),
          };
        }),
      );
    },
    [activeTabId],
  );

  const handleFocusPane = useCallback(
    (paneId: string) => {
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== activeTabId) return tab;
          return {
            ...tab,
            activePaneId: paneId,
            panes: tab.panes.map((p) => ({ ...p, isActive: p.id === paneId })),
          };
        }),
      );
    },
    [activeTabId],
  );

  const handleChangeLayout = useCallback(
    (layout: TerminalLayoutMode) => {
      setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, layout } : t)));
    },
    [activeTabId],
  );

  const handleToggleZoom = useCallback(() => {
    setIsZoomed((z) => !z);
  }, []);

  const handleExecuteCommand = useCallback(
    (cmd: string) => {
      setHistory((prev) => [
        {
          id: `h-${Date.now()}`,
          command: cmd,
          cwd: initialCwd || '~/project',
          timestamp: Date.now(),
          exitCode: 0,
        },
        ...prev.slice(0, 50),
      ]);
    },
    [initialCwd],
  );

  const handlePaletteAction = useCallback(
    (actionId: string) => {
      switch (actionId) {
        case 'split-right':
          handleSplitRight();
          break;
        case 'split-down':
          handleSplitDown();
          break;
        case 'toggle-zoom':
          handleToggleZoom();
          break;
        case 'layout-splits':
          handleChangeLayout('splits');
          break;
        case 'layout-fat':
          handleChangeLayout('fat');
          break;
        case 'layout-tall':
          handleChangeLayout('tall');
          break;
        case 'layout-grid':
          handleChangeLayout('grid');
          break;
        case 'new-tab':
          handleNewTab();
          break;
        case 'close-pane':
          handleClosePane(activeTab.activePaneId);
          break;
        case 'quickselect':
          setIsQuickSelectOpen(true);
          break;
        case 'search':
          setIsSearchOpen(true);
          break;
        case 'instant-replay':
          setIsReplayOpen((v) => !v);
          break;
        case 'toggle-toolbelt':
          setIsToolbeltOpen((v) => !v);
          break;
        case 'shortcuts-help':
          setIsHelpOpen(true);
          break;
      }
    },
    [
      handleSplitRight,
      handleSplitDown,
      handleToggleZoom,
      handleChangeLayout,
      handleNewTab,
      handleClosePane,
      activeTab?.activePaneId,
    ],
  );

  return {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    handleNewTab,
    handleCloseTab,
    handleSplitRight,
    handleSplitDown,
    handleClosePane,
    handleFocusPane,
    handleChangeLayout,
    handleToggleZoom,
    isZoomed,
    isPaletteOpen,
    setIsPaletteOpen,
    isQuickSelectOpen,
    setIsQuickSelectOpen,
    isSearchOpen,
    setIsSearchOpen,
    isReplayOpen,
    setIsReplayOpen,
    isToolbeltOpen,
    setIsToolbeltOpen,
    isHelpOpen,
    setIsHelpOpen,
    history,
    handleExecuteCommand,
    handlePaletteAction,
  };
}
