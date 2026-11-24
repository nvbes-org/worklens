import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  ExternalLink,
  EyeOff,
  HardDrive,
  Maximize2,
  Minus,
  MoreVertical,
  Pin,
  PinOff,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AuroraTerminalHeaderActions, AuroraTerminalHeaderTabs } from '../terminal';
import type { WindowCloseMode, WindowInstance } from './types';

interface WindowHeaderProps {
  instance: WindowInstance;
  onDragStart?: (event: React.PointerEvent) => void;
  onToggleAlwaysOnTop: () => void;
  onDuplicate: () => void;
  onToggleDock: () => void;
  onDetachToNative?: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: (mode: WindowCloseMode) => void;
}

export function WindowHeader({
  instance,
  onDragStart,
  onToggleAlwaysOnTop,
  onDuplicate,
  onToggleDock,
  onDetachToNative,
  onMinimize,
  onMaximize,
  onClose,
}: WindowHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const isDocked = instance.dockMode === 'docked';
  const isTerminal = instance.rendererId === 'aurora-terminal';

  return (
    <div
      data-testid="window-header"
      className={`window-header relative flex items-center justify-between px-3 py-1.5 select-none border-b ${
        isTerminal
          ? 'bg-[#0d111c]/95 border-white/10 text-slate-200'
          : isDocked
            ? 'bg-zinc-100/80 dark:bg-zinc-800/80 border-black/5 dark:border-white/10'
            : 'bg-zinc-50/95 dark:bg-zinc-900/95 backdrop-blur-md border-black/5 dark:border-white/10'
      } ${instance.isAlwaysOnTop ? 'ring-1 ring-amber-500/30' : ''}`}
      onPointerDown={onDragStart}
    >
      {/* Title & Status */}
      <div className="flex items-center gap-2 min-w-0 pr-2">
        <span
          className={`size-2 rounded-full shrink-0 ${
            instance.state === 'visible'
              ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
              : instance.state === 'hidden'
                ? 'bg-amber-500'
                : 'bg-blue-400'
          }`}
          title={`État: ${instance.state}`}
        />
        <div className="min-w-0 flex items-center gap-1.5 shrink-0">
          {isTerminal && <Terminal className="size-3.5 text-cyan-400 shrink-0" />}
          <span
            className={`text-xs font-semibold truncate ${
              isTerminal ? 'text-slate-100' : 'text-zinc-900 dark:text-zinc-100'
            }`}
          >
            {instance.title}
          </span>
          {instance.subtitle && !isTerminal && (
            <span className="text-[11px] text-zinc-400 truncate hidden sm:inline">· {instance.subtitle}</span>
          )}
        </div>

        {/* Terminal Tabs (Page du terminal) */}
        {isTerminal && <AuroraTerminalHeaderTabs />}

        {/* Badges */}
        {instance.isAlwaysOnTop && (
          <span
            data-testid="badge-always-on-top"
            className="text-[9px] font-medium tracking-tight bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5"
            title="Focus permanent en 1er plan actif"
          >
            <Pin className="size-2.5 fill-current" />
            1er plan
          </span>
        )}
        <span
          className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 border ${
            isTerminal
              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
              : 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-500 border-transparent'
          }`}
          title={
            isDocked
              ? 'Attaché à l’interface'
              : instance.dockMode === 'native_detached'
                ? 'Fenêtre native du système (OS)'
                : 'Fenêtre flottante détachée'
          }
        >
          {isDocked ? 'Docké' : instance.dockMode === 'native_detached' ? 'Natif OS' : 'Détaché'}
        </span>
      </div>

      {/* Control Buttons */}
      <div
        className="flex items-center gap-1 shrink-0"
        onPointerDown={(e) => e.stopPropagation()} // Prevent dragging from buttons
      >
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
          data-testid="btn-toggle-always-on-top"
          onClick={onToggleAlwaysOnTop}
          aria-pressed={instance.isAlwaysOnTop}
          className={`p-1 rounded-md transition-colors ${
            instance.isAlwaysOnTop
              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
              : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800'
          }`}
          title={
            instance.isAlwaysOnTop
              ? 'Désactiver le focus permanent en 1er plan'
              : 'Activer le focus permanent en 1er plan (Toujours au-dessus)'
          }
          aria-label="Focus permanent en 1er plan"
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
          data-testid="btn-duplicate-window"
          onClick={onDuplicate}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
          title="Dupliquer cette fenêtre"
          aria-label="Dupliquer"
        >
          <Copy className="size-3.5" />
        </button>

        {/* Detach / Dock toggle */}
        <button
          type="button"
          data-testid="btn-toggle-dock"
          onClick={onToggleDock}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
          title={
            isDocked
              ? "Détacher de l'interface principale (Fenêtre flottante)"
              : "Rattacher à l'interface principale (Dock)"
          }
          aria-label={isDocked ? 'Détacher' : 'Rattacher'}
        >
          {isDocked ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}
        </button>

        {/* Detach to native OS window */}
        {onDetachToNative && instance.dockMode !== 'native_detached' && (
          <button
            type="button"
            data-testid="btn-detach-native"
            onClick={onDetachToNative}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
            title="Détacher en fenêtre native du système d'exploitation"
            aria-label="Détacher en fenêtre native"
          >
            <ExternalLink className="size-3.5" />
          </button>
        )}

        {/* Minimize */}
        <button
          type="button"
          data-testid="btn-minimize-window"
          onClick={onMinimize}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
          title="Minimiser"
          aria-label="Minimiser"
        >
          <Minus className="size-3.5" />
        </button>

        {/* Maximize */}
        <button
          type="button"
          data-testid="btn-maximize-window"
          onClick={onMaximize}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors"
          title={instance.geometry.isMaximized ? 'Restaurer la taille' : 'Agrandir'}
          aria-label={instance.geometry.isMaximized ? 'Restaurer' : 'Agrandir'}
        >
          {instance.geometry.isMaximized ? (
            <Square className="size-3.5" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
        </button>

        {/* Close Actions Menu Dropdown */}
        <div className="relative" ref={menuRef}>
          <div className="flex items-center rounded-md hover:bg-red-500/10 transition-colors">
            <button
              type="button"
              data-testid="btn-close-window-default"
              onClick={() => onClose('terminate')}
              className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
              title="Fermer la session"
              aria-label="Fermer"
            >
              <X className="size-3.5" />
            </button>
            <button
              type="button"
              data-testid="btn-close-menu-trigger"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              title="Options de fermeture"
              aria-label="Options de fermeture"
            >
              <MoreVertical className="size-3" />
            </button>
          </div>

          {menuOpen && (
            <div
              data-testid="window-close-options-menu"
              className="absolute right-0 top-full mt-1 w-64 py-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 text-xs"
            >
              <button
                type="button"
                data-testid="option-close-terminate"
                onClick={() => {
                  setMenuOpen(false);
                  onClose('terminate');
                }}
                className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-800 dark:text-zinc-200 transition-colors group"
              >
                <Trash2 className="size-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-red-600 dark:text-red-400">Fermer et clore la session</div>
                  <div className="text-[10px] text-zinc-500">
                    Détruit l'instance et libère toute la mémoire.
                  </div>
                </div>
              </button>

              <button
                type="button"
                data-testid="option-close-keep-active"
                onClick={() => {
                  setMenuOpen(false);
                  onClose('keep_active');
                }}
                className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors"
              >
                <EyeOff className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Fermer visuellement (Actif)</div>
                  <div className="text-[10px] text-zinc-500">
                    Masque la vue mais garde l'instance active en RAM.
                  </div>
                </div>
              </button>

              <button
                type="button"
                data-testid="option-close-freeze-to-disk"
                onClick={() => {
                  setMenuOpen(false);
                  onClose('freeze_to_disk');
                }}
                className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 transition-colors"
              >
                <HardDrive className="size-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Figer et basculer sur disque</div>
                  <div className="text-[10px] text-zinc-500">
                    Sauvegarde l'état sur disque dur et libère la RAM.
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
