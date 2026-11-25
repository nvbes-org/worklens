import { type ReactNode, useCallback } from 'react';
import { AuroraTerminalProvider } from '../terminal';
import type { WindowCloseMode, WindowGeometry, WindowInstance } from './types';
import { useWindowManager } from './window-context';
import { WindowHeader } from './window-header';
import { WindowResizeHandles } from './window-resize-handles';

interface ManagedWindowProps {
  instance: WindowInstance;
  children?: ReactNode;
  className?: string;
}

export function ManagedWindow({ instance, children, className = '' }: ManagedWindowProps) {
  const {
    focusWindow,
    closeWindow,
    duplicateWindow,
    toggleAlwaysOnTop,
    toggleDock,
    detachToNativeWindow,
    updateGeometry,
    renderContent,
    focusedInstanceId,
  } = useWindowManager();

  const isDocked = instance.dockMode === 'docked';
  const isFocused = focusedInstanceId === instance.id;
  const isMinimized = instance.geometry.isMinimized ?? false;
  const isMaximized = instance.geometry.isMaximized ?? false;

  // Dragging logic for floating window
  const handleDragStart = useCallback(
    (startEvent: React.PointerEvent) => {
      if (isDocked || isMaximized || startEvent.button !== 0) return;
      const target = startEvent.target as HTMLElement | null;
      if (target?.closest('button, input, select, textarea, [data-no-drag]')) return;

      startEvent.preventDefault();
      focusWindow(instance.id);

      const startX = startEvent.clientX;
      const startY = startEvent.clientY;
      const initialX = instance.geometry.x;
      const initialY = instance.geometry.y;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        const nextX = Math.max(0, Math.min(window.innerWidth - 120, initialX + deltaX));
        const nextY = Math.max(0, Math.min(window.innerHeight - 40, initialY + deltaY));

        updateGeometry(instance.id, { x: nextX, y: nextY });
      };

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [
      isDocked,
      isMaximized,
      instance.id,
      instance.geometry.x,
      instance.geometry.y,
      focusWindow,
      updateGeometry,
    ],
  );

  const handleResize = useCallback(
    (updates: Partial<WindowGeometry>) => {
      updateGeometry(instance.id, updates);
    },
    [instance.id, updateGeometry],
  );

  const handleMinimize = useCallback(() => {
    updateGeometry(instance.id, { isMinimized: !isMinimized });
  }, [instance.id, isMinimized, updateGeometry]);

  const handleMaximize = useCallback(() => {
    updateGeometry(instance.id, { isMaximized: !isMaximized, isMinimized: false });
  }, [instance.id, isMaximized, updateGeometry]);

  const handleClose = useCallback(
    (mode: WindowCloseMode) => {
      void closeWindow(instance.id, mode);
    },
    [instance.id, closeWindow],
  );

  // If hidden, frozen, or native_detached, do not render visual window inside main window
  if (instance.state !== 'visible' || instance.dockMode === 'native_detached') {
    return null;
  }

  // Calculate Z-Index: Always-on-top tier is 9000-9999, standard floating tier is 1000-8999
  const baseZ = instance.isAlwaysOnTop ? 9000 : 1000;
  const zIndex = baseZ + (isFocused ? 100 : 10);
  const isTerminal = instance.rendererId === 'aurora-terminal';

  const content = children ?? renderContent(instance);

  // DOCKED WINDOW RENDERING
  if (isDocked) {
    const dockedElement = (
      <div
        data-testid={`managed-window-${instance.id}`}
        data-window-docked="true"
        data-always-on-top={instance.isAlwaysOnTop}
        className={`managed-window-docked flex flex-col w-full h-full rounded-xl border overflow-hidden shadow-sm transition-all ${
          isTerminal
            ? 'border-white/10 bg-[#090d16] text-slate-100'
            : 'border-black/10 dark:border-white/10 bg-white/95 dark:bg-zinc-900/95'
        } ${className}`}
        onPointerDown={() => focusWindow(instance.id)}
      >
        <WindowHeader
          instance={instance}
          onToggleAlwaysOnTop={() => toggleAlwaysOnTop(instance.id)}
          onDuplicate={() => duplicateWindow(instance.id)}
          onToggleDock={() => toggleDock(instance.id)}
          onDetachToNative={() => void detachToNativeWindow(instance.id)}
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
        />
        {!isMinimized && (
          <div
            className={`flex-1 min-h-0 select-text ${
              isTerminal ? 'p-0 overflow-hidden' : 'p-3 overflow-auto text-zinc-800 dark:text-zinc-200'
            }`}
          >
            {content}
          </div>
        )}
      </div>
    );

    if (isTerminal) {
      return <AuroraTerminalProvider instance={instance}>{dockedElement}</AuroraTerminalProvider>;
    }
    return dockedElement;
  }

  // FLOATING DETACHED WINDOW RENDERING
  const floatingStyle: React.CSSProperties = isMaximized
    ? {
        position: 'fixed',
        top: '12px',
        left: '12px',
        right: '12px',
        bottom: '12px',
        zIndex,
      }
    : {
        position: 'fixed',
        left: `${instance.geometry.x}px`,
        top: `${instance.geometry.y}px`,
        width: `${instance.geometry.width}px`,
        height: isMinimized ? 'auto' : `${instance.geometry.height}px`,
        zIndex,
      };

  const floatingElement = (
    <div
      data-testid={`managed-window-${instance.id}`}
      data-window-floating="true"
      data-always-on-top={instance.isAlwaysOnTop}
      data-minimized={isMinimized}
      data-maximized={isMaximized}
      className={`managed-window-floating flex flex-col rounded-xl border overflow-hidden shadow-2xl backdrop-blur-xl transition-[shadow,border] ${
        isFocused
          ? 'border-blue-500/40 ring-1 ring-blue-500/20 shadow-blue-500/10'
          : isTerminal
            ? 'border-white/10'
            : 'border-black/10 dark:border-white/10'
      } ${
        instance.isAlwaysOnTop ? 'shadow-[0_20px_50px_rgba(245,158,11,0.18)]' : 'shadow-black/20'
      } ${
        isTerminal ? 'bg-[#090d16] text-slate-100' : 'bg-white/95 dark:bg-zinc-900/95'
      } ${className}`}
      style={floatingStyle}
      onPointerDown={() => focusWindow(instance.id)}
    >
      <WindowHeader
        instance={instance}
        onDragStart={handleDragStart}
        onToggleAlwaysOnTop={() => toggleAlwaysOnTop(instance.id)}
        onDuplicate={() => duplicateWindow(instance.id)}
        onToggleDock={() => toggleDock(instance.id)}
        onDetachToNative={() => void detachToNativeWindow(instance.id)}
        onMinimize={handleMinimize}
        onMaximize={handleMaximize}
        onClose={handleClose}
      />

      {!isMinimized && (
        <div
          className={`flex-1 min-h-0 select-text ${
            isTerminal ? 'p-0 overflow-hidden' : 'p-3 overflow-auto text-zinc-800 dark:text-zinc-200'
          }`}
        >
          {content}
        </div>
      )}

      {/* 8-direction resize handles when not maximized or minimized */}
      {!isMaximized && !isMinimized && (
        <WindowResizeHandles geometry={instance.geometry} onResize={handleResize} />
      )}
    </div>
  );

  if (isTerminal) {
    return <AuroraTerminalProvider instance={instance}>{floatingElement}</AuroraTerminalProvider>;
  }
  return floatingElement;
}
