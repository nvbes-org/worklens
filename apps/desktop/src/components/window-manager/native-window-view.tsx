import { isTauri } from '@tauri-apps/api/core';
import { ArrowDownLeft, Copy, EyeOff, HardDrive, MoreVertical, Pin, PinOff, Terminal, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  AuroraTerminalHeaderActions,
  AuroraTerminalHeaderTabs,
  AuroraTerminalProvider,
} from '../terminal';
import { broadcastWindowEvent, subscribeToWindowBus } from './window-bus';
import { useWindowManager } from './window-context';

interface NativeWindowViewProps {
  windowId: string;
}

export function NativeWindowView({ windowId }: NativeWindowViewProps) {
  const { instances, toggleAlwaysOnTop, closeWindow, duplicateWindow, renderContent } = useWindowManager();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const instance = instances.find((w) => w.id === windowId);

  // Close popup menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Close native OS window helper
  const closeSelf = async () => {
    if (isTauri()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
      } catch {
        window.close();
      }
    } else {
      window.close();
    }
  };

  // Reattach from native window back into the main application dock
  const handleReattach = async () => {
    broadcastWindowEvent({ type: 'WINDOW_ATTACH_REQUEST', id: windowId });
    await closeSelf();
  };

  // Handle closing with selected strategy
  const handleClose = async (mode: 'terminate' | 'keep_active' | 'freeze_to_disk') => {
    broadcastWindowEvent({ type: 'WINDOW_ACTION_CLOSE', id: windowId, mode });
    await closeWindow(windowId, mode);
    await closeSelf();
  };

  // Duplicate instance
  const handleDuplicate = () => {
    broadcastWindowEvent({ type: 'WINDOW_ACTION_DUPLICATE', id: windowId });
    duplicateWindow(windowId);
  };

  // Toggle Always On Top
  const handleTogglePin = () => {
    toggleAlwaysOnTop(windowId);
  };

  // Notify main window when closing native window directly
  useEffect(() => {
    function handleBeforeUnload() {
      broadcastWindowEvent({ type: 'WINDOW_NATIVE_CLOSED', id: windowId });
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [windowId]);

  // Also listen for bus close events targeting this window
  useEffect(() => {
    const unsub = subscribeToWindowBus((msg) => {
      if (msg.type === 'WINDOW_ACTION_CLOSE' && msg.id === windowId) {
        void closeSelf();
      }
    });
    return unsub;
  }, [windowId]);

  if (!instance) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-500 text-sm p-6 text-center">
        <p>Fenêtre introuvable ou fermée.</p>
        <button
          type="button"
          onClick={() => void closeSelf()}
          className="mt-4 px-3 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs"
        >
          Fermer cette fenêtre
        </button>
      </div>
    );
  }

  const isTerminal = instance.rendererId === 'aurora-terminal';

  const viewContent = (
    <div
      data-testid={`native-window-view-${instance.id}`}
      data-native-window="true"
      data-always-on-top={instance.isAlwaysOnTop}
      className={`flex flex-col h-screen w-screen overflow-hidden select-none ${
        isTerminal
          ? 'bg-[#090d16] text-slate-100'
          : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100'
      }`}
    >
      {/* Top macOS-friendly drag bar */}
      <header
        data-testid="native-window-header"
        data-tauri-drag-region
        className={`flex items-center justify-between px-3 py-1.5 border-b select-none cursor-grab active:cursor-grabbing ${
          isTerminal
            ? 'bg-[#0d111c]/95 border-white/10 text-slate-200'
            : 'bg-zinc-100/90 dark:bg-zinc-800/90 border-black/5 dark:border-white/10'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0" data-tauri-drag-region>
          {/* macOS traffic light spacer */}
          <div className="w-16 h-4 shrink-0" data-tauri-drag-region />
          <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0 shrink-0 font-semibold text-xs">
            {isTerminal && <Terminal className="size-3.5 text-cyan-400 shrink-0" />}
            <span className={`truncate ${isTerminal ? 'text-slate-100' : 'text-zinc-900 dark:text-zinc-100'}`}>
              {instance.title}
            </span>
          </div>

          {/* Terminal Tabs (Page du terminal) */}
          {isTerminal && <AuroraTerminalHeaderTabs />}

          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 border ${
              isTerminal
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25'
            }`}
          >
            Natif OS
          </span>

          {instance.isAlwaysOnTop && (
            <span
              data-testid="native-badge-always-on-top"
              className="text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 shrink-0"
            >
              <Pin className="size-2.5 fill-current" />
              1er plan
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
          {/* Terminal Action Buttons */}
          {isTerminal && (
            <>
              <AuroraTerminalHeaderActions />
              <div className="h-3.5 w-px bg-white/10 mx-1" />
            </>
          )}

          {/* Always on top toggle */}
          <button
            type="button"
            data-testid="native-btn-toggle-always-on-top"
            onClick={handleTogglePin}
            aria-pressed={instance.isAlwaysOnTop}
            className={`p-1 rounded-md transition-colors ${
              instance.isAlwaysOnTop
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : isTerminal
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
                  : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50'
            }`}
            title="Focus permanent au 1er plan (Always-on-top OS)"
            aria-label="Focus permanent au 1er plan"
          >
            {instance.isAlwaysOnTop ? (
              <Pin className="size-3.5 fill-current" />
            ) : (
              <PinOff className="size-3.5" />
            )}
          </button>

          {/* Duplicate */}
          <button
            type="button"
            data-testid="native-btn-duplicate"
            onClick={handleDuplicate}
            className={`p-1 rounded-md transition-colors ${
              isTerminal
                ? 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
                : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50'
            }`}
            title="Dupliquer la fenêtre"
            aria-label="Dupliquer"
          >
            <Copy className="size-3.5" />
          </button>

          {/* Reattach to main interface */}
          <button
            type="button"
            data-testid="native-btn-reattach"
            onClick={() => void handleReattach()}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              isTerminal
                ? 'bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10'
                : 'text-zinc-700 dark:text-zinc-200 bg-white/70 dark:bg-zinc-700/60 hover:bg-white dark:hover:bg-zinc-700 border border-black/5 dark:border-white/10 shadow-2xs'
            }`}
            title="Rattacher cette fenêtre à l'interface principale"
            aria-label="Rattacher à l'interface principale"
          >
            <ArrowDownLeft className="size-3.5" />
            <span className="hidden sm:inline">Rattacher</span>
          </button>

          {/* Multi-action close menu */}
          <div className="relative" ref={menuRef}>
            <div className="flex items-center rounded-md hover:bg-red-500/10 transition-colors">
              <button
                type="button"
                data-testid="native-btn-close-default"
                onClick={() => void handleClose('terminate')}
                className={`p-1 transition-colors ${
                  isTerminal ? 'text-slate-400 hover:text-red-400' : 'text-zinc-400 hover:text-red-500'
                }`}
                title="Fermer la session"
                aria-label="Fermer"
              >
                <X className="size-3.5" />
              </button>
              <button
                type="button"
                data-testid="native-btn-close-menu"
                onClick={() => setMenuOpen((prev) => !prev)}
                className={`p-0.5 ${
                  isTerminal
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
                title="Options de fermeture"
                aria-label="Options de fermeture"
              >
                <MoreVertical className="size-3" />
              </button>
            </div>

            {menuOpen && (
              <div
                data-testid="native-close-options-menu"
                className={`absolute right-0 top-full mt-1 w-64 py-1 rounded-lg shadow-xl z-50 text-xs border ${
                  isTerminal
                    ? 'bg-[#121724] border-white/10 text-slate-200'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200'
                }`}
              >
                <button
                  type="button"
                  data-testid="native-option-close-terminate"
                  onClick={() => {
                    setMenuOpen(false);
                    void handleClose('terminate');
                  }}
                  className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="size-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-red-600 dark:text-red-400">
                      Fermer et clore la session
                    </div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      Détruit l'instance et libère toute la mémoire.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="native-option-close-keep-active"
                  onClick={() => {
                    setMenuOpen(false);
                    void handleClose('keep_active');
                  }}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                    isTerminal ? 'hover:bg-white/5' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <EyeOff className="size-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">Fermer visuellement (Actif)</div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      Garde l'instance active en mémoire dans la fenêtre principale.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="native-option-close-freeze"
                  onClick={() => {
                    setMenuOpen(false);
                    void handleClose('freeze_to_disk');
                  }}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${
                    isTerminal ? 'hover:bg-white/5' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <HardDrive className="size-4 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">Figer et basculer sur disque</div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      Sauvegarde l'état sur disque dur et libère la RAM.
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content Body */}
      <main
        className={`flex-1 min-h-0 select-text ${
          isTerminal ? 'p-0 overflow-hidden' : 'p-4 overflow-auto'
        }`}
      >
        {renderContent(instance)}
      </main>
    </div>
  );

  if (isTerminal) {
    return <AuroraTerminalProvider instance={instance}>{viewContent}</AuroraTerminalProvider>;
  }

  return viewContent;
}
