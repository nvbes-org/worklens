import type { ReactNode } from 'react';
import { useState } from 'react';
import { ManagedWindow } from './managed-window';
import { useWindowManager } from './window-context';

interface WindowDockSlotProps {
  name?: string;
  className?: string;
  fallback?: ReactNode;
}

export function WindowDockSlot({ name = 'main', className = '', fallback = null }: WindowDockSlotProps) {
  const { getInstancesBySlot } = useWindowManager();
  const dockedWindows = getInstancesBySlot(name);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

  if (dockedWindows.length === 0) {
    return fallback ? <div className={`window-dock-slot-empty ${className}`}>{fallback}</div> : null;
  }

  const activeWindow = dockedWindows.find((w) => w.id === selectedTabId) ?? dockedWindows[0];

  return (
    <div
      data-testid={`dock-slot-${name}`}
      className={`window-dock-slot flex flex-col h-full w-full overflow-hidden ${className}`}
    >
      {/* If multiple windows are docked in this slot, render tab switcher */}
      {dockedWindows.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-zinc-200/50 dark:bg-zinc-800/50 border-b border-black/5 dark:border-white/5 overflow-x-auto">
          {dockedWindows.map((win) => {
            const isTabActive = win.id === activeWindow?.id;
            return (
              <button
                key={win.id}
                type="button"
                data-testid={`dock-tab-${win.id}`}
                onClick={() => setSelectedTabId(win.id)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors truncate max-w-[180px] flex items-center gap-1.5 ${
                  isTabActive
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-white/40 dark:hover:bg-zinc-800/40'
                }`}
              >
                <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">{win.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Render the currently selected docked window */}
      {activeWindow && (
        <div className="flex-1 min-h-0 w-full h-full">
          <ManagedWindow instance={activeWindow} />
        </div>
      )}
    </div>
  );
}
