import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Eye,
  EyeOff,
  HardDrive,
  Layers,
  Pin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatByteSize } from './disk-storage';
import { useWindowManager } from './window-context';

export function InstanceDock() {
  const {
    instances,
    createWindow,
    restoreWindow,
    duplicateWindow,
    terminateInstance,
    freezeInstance,
    closeWindow,
    toggleAlwaysOnTop,
    toggleDock,
  } = useWindowManager();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const visibleInstances = instances.filter((i) => i.state === 'visible');
  const hiddenInstances = instances.filter((i) => i.state === 'hidden');
  const frozenInstances = instances.filter((i) => i.state === 'frozen');

  const totalInstances = instances.length;

  return (
    <div ref={containerRef} className="relative inline-block select-none" data-testid="instance-dock">
      {/* Trigger Button */}
      <button
        type="button"
        data-testid="instance-dock-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border border-black/10 dark:border-white/10 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-md shadow-xs hover:bg-white dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 transition-colors"
        title="Gestionnaire d'instances de fenêtres"
        aria-expanded={isOpen}
      >
        <Layers className="size-3.5 text-zinc-500" />
        <span>Fenêtres</span>
        <div className="flex items-center gap-1 ml-0.5">
          {visibleInstances.length > 0 && (
            <span
              data-testid="badge-visible-count"
              className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold"
              title={`${visibleInstances.length} fenêtre(s) visible(s)`}
            >
              {visibleInstances.length}
            </span>
          )}
          {hiddenInstances.length > 0 && (
            <span
              data-testid="badge-hidden-count"
              className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold animate-pulse"
              title={`${hiddenInstances.length} instance(s) active(s) en arrière-plan (RAM)`}
            >
              {hiddenInstances.length}
            </span>
          )}
          {frozenInstances.length > 0 && (
            <span
              data-testid="badge-frozen-count"
              className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-500/15 text-blue-600 dark:text-blue-400 font-semibold"
              title={`${frozenInstances.length} instance(s) figée(s) sur disque`}
            >
              {frozenInstances.length}
            </span>
          )}
        </div>
      </button>

      {/* Popover Panel */}
      {isOpen && (
        <div
          data-testid="instance-dock-panel"
          className="absolute right-0 top-full mt-2 w-96 max-h-[85vh] flex flex-col bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden text-xs"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-black/5 dark:border-white/10 bg-zinc-50/80 dark:bg-zinc-800/80">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-zinc-700 dark:text-zinc-300" />
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                Instances ({totalInstances})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="btn-new-window"
                onClick={() => {
                  createWindow({
                    title: `Moniteur ${Date.now().toString().slice(-4)}`,
                    subtitle: 'Session interactive',
                    rendererId: 'sample-widget',
                    dockMode: 'floating',
                    initialData: { counter: 0, text: 'Données de travail en mémoire...' },
                  });
                  setIsOpen(false);
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
                title="Créer une nouvelle fenêtre"
              >
                <Plus className="size-3" />
                <span>Nouveau</span>
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                aria-label="Fermer le gestionnaire"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Instance List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-[420px]">
            {totalInstances === 0 ? (
              <div className="p-6 text-center text-zinc-400">Aucune instance de fenêtre active.</div>
            ) : (
              instances.map((inst) => {
                const isFrozen = inst.state === 'frozen';
                const isHidden = inst.state === 'hidden';
                const isVisible = inst.state === 'visible';

                return (
                  <div
                    key={inst.id}
                    data-testid={`instance-item-${inst.id}`}
                    data-instance-state={inst.state}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isFrozen
                        ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200/50 dark:border-blue-900/40'
                        : isHidden
                          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-900/40'
                          : 'bg-white dark:bg-zinc-800/60 border-zinc-200/80 dark:border-zinc-700/60 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`size-2 rounded-full shrink-0 ${
                              isVisible
                                ? 'bg-emerald-500'
                                : isHidden
                                  ? 'bg-amber-500 animate-pulse'
                                  : 'bg-blue-400'
                            }`}
                          />
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {inst.title}
                          </span>
                          {inst.isAlwaysOnTop && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-600 px-1 rounded-sm">
                              1er plan
                            </span>
                          )}
                          <span className="text-[9px] text-zinc-400">
                            ({inst.dockMode === 'docked' ? 'Docké' : 'Flottant'})
                          </span>
                        </div>

                        {/* Status detail */}
                        <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                          {isFrozen && (
                            <>
                              <HardDrive className="size-3 text-blue-500 shrink-0" />
                              <span>
                                Figé sur disque (
                                {inst.diskMetadata
                                  ? formatByteSize(inst.diskMetadata.byteSize)
                                  : 'sur disque'}
                                ) · RAM libérée
                              </span>
                            </>
                          )}
                          {isHidden && (
                            <>
                              <EyeOff className="size-3 text-amber-500 shrink-0" />
                              <span>Masqué visuellement · Actif en mémoire</span>
                            </>
                          )}
                          {isVisible && (
                            <>
                              <Eye className="size-3 text-emerald-500 shrink-0" />
                              <span>Visible à l'écran</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Restore button */}
                        {!isVisible && (
                          <button
                            type="button"
                            data-testid={`btn-restore-${inst.id}`}
                            onClick={() => void restoreWindow(inst.id)}
                            className="px-2 py-0.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium text-[11px] hover:opacity-90"
                            title={isFrozen ? 'Dégeler de la mémoire disque' : 'Afficher la fenêtre'}
                          >
                            Restaurer
                          </button>
                        )}

                        {/* Pin */}
                        <button
                          type="button"
                          onClick={() => toggleAlwaysOnTop(inst.id)}
                          className={`p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 ${
                            inst.isAlwaysOnTop ? 'text-amber-500' : ''
                          }`}
                          title="Basculer 1er plan"
                        >
                          <Pin className="size-3" />
                        </button>

                        {/* Dock / Undock */}
                        <button
                          type="button"
                          data-testid={`btn-dock-toggle-${inst.id}`}
                          onClick={() => toggleDock(inst.id)}
                          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                          title={inst.dockMode === 'docked' ? 'Détacher (flottant)' : 'Rattacher (docké)'}
                        >
                          {inst.dockMode === 'docked' ? (
                            <ArrowUpRight className="size-3" />
                          ) : (
                            <ArrowDownLeft className="size-3" />
                          )}
                        </button>

                        {/* Duplicate */}
                        <button
                          type="button"
                          data-testid={`btn-dock-duplicate-${inst.id}`}
                          onClick={() => duplicateWindow(inst.id)}
                          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                          title="Dupliquer l'instance"
                        >
                          <Copy className="size-3" />
                        </button>

                        {/* Freeze to disk */}
                        {isVisible && (
                          <button
                            type="button"
                            data-testid={`btn-dock-freeze-${inst.id}`}
                            onClick={() => void freezeInstance(inst.id)}
                            className="p-1 rounded-md text-zinc-400 hover:text-blue-500"
                            title="Figer et basculer sur disque"
                          >
                            <HardDrive className="size-3" />
                          </button>
                        )}

                        {/* Hide in background */}
                        {isVisible && (
                          <button
                            type="button"
                            data-testid={`btn-dock-hide-${inst.id}`}
                            onClick={() => void closeWindow(inst.id, 'keep_active')}
                            className="p-1 rounded-md text-zinc-400 hover:text-amber-500"
                            title="Masquer en arrière-plan (garder actif)"
                          >
                            <EyeOff className="size-3" />
                          </button>
                        )}

                        {/* Terminate session */}
                        <button
                          type="button"
                          data-testid={`btn-dock-terminate-${inst.id}`}
                          onClick={() => void terminateInstance(inst.id)}
                          className="p-1 rounded-md text-zinc-400 hover:text-red-500"
                          title="Clore la session définitivement"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
