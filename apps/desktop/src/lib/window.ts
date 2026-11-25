import { isTauri } from '@tauri-apps/api/core';
import { useEffect } from 'react';

/**
 * Initiates native Tauri window dragging.
 * Safely ignores clicks originating from interactive controls.
 */
export async function startWindowDrag(event?: React.MouseEvent | MouseEvent): Promise<void> {
  if (event) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest('button, input, select, textarea, a, [role="button"], [role="switch"], [data-no-drag]')
    ) {
      return;
    }
  }

  if (isTauri()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().startDragging();
    } catch {
      // In case window dragging is not permitted or unavailable
    }
  }
}

/**
 * Global window drag listener hook.
 * Listens for mousedown on any element marked with `data-tauri-drag-region`,
 * initiating native window dragging while respecting interactive controls.
 */
export function useWindowDrag(): void {
  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        target.closest('button, input, select, textarea, a, [role="button"], [role="switch"], [data-no-drag]')
      ) {
        return;
      }
      if (target.closest('[data-tauri-drag-region]')) {
        void startWindowDrag();
      }
    }

    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, []);
}
