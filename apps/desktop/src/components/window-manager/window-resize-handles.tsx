import { useCallback } from 'react';
import type { WindowGeometry } from './types';

interface ResizeHandlesProps {
  geometry: WindowGeometry;
  onResize: (updates: Partial<WindowGeometry>) => void;
  disabled?: boolean;
}

type Direction = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface HandleConfig {
  dir: Direction;
  cursor: string;
  className: string;
}

const HANDLES: HandleConfig[] = [
  { dir: 'n', cursor: 'ns-resize', className: 'top-0 left-2 right-2 h-1.5' },
  { dir: 's', cursor: 'ns-resize', className: 'bottom-0 left-2 right-2 h-1.5' },
  { dir: 'e', cursor: 'ew-resize', className: 'right-0 top-2 bottom-2 w-1.5' },
  { dir: 'w', cursor: 'ew-resize', className: 'left-0 top-2 bottom-2 w-1.5' },
  { dir: 'nw', cursor: 'nwse-resize', className: 'top-0 left-0 size-3' },
  { dir: 'ne', cursor: 'nesw-resize', className: 'top-0 right-0 size-3' },
  { dir: 'sw', cursor: 'nesw-resize', className: 'bottom-0 left-0 size-3' },
  { dir: 'se', cursor: 'nwse-resize', className: 'bottom-0 right-0 size-3' },
];

export function WindowResizeHandles({ geometry, onResize, disabled }: ResizeHandlesProps) {
  const startResizing = useCallback(
    (dir: Direction, startEvent: React.PointerEvent) => {
      if (disabled || startEvent.button !== 0) return;
      startEvent.preventDefault();
      startEvent.stopPropagation();

      const startX = startEvent.clientX;
      const startY = startEvent.clientY;
      const initialGeom = { ...geometry };
      const minW = geometry.minWidth ?? 320;
      const minH = geometry.minHeight ?? 200;
      const maxW = geometry.maxWidth ?? window.innerWidth;
      const maxH = geometry.maxHeight ?? window.innerHeight;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        let nextX = initialGeom.x;
        let nextY = initialGeom.y;
        let nextW = initialGeom.width;
        let nextH = initialGeom.height;

        if (dir.includes('e')) {
          nextW = Math.max(minW, Math.min(maxW, initialGeom.width + deltaX));
        }
        if (dir.includes('s')) {
          nextH = Math.max(minH, Math.min(maxH, initialGeom.height + deltaY));
        }
        if (dir.includes('w')) {
          const rawW = initialGeom.width - deltaX;
          const clampedW = Math.max(minW, Math.min(maxW, rawW));
          nextX = initialGeom.x + (initialGeom.width - clampedW);
          nextW = clampedW;
        }
        if (dir.includes('n')) {
          const rawH = initialGeom.height - deltaY;
          const clampedH = Math.max(minH, Math.min(maxH, rawH));
          nextY = initialGeom.y + (initialGeom.height - clampedH);
          nextH = clampedH;
        }

        onResize({ x: nextX, y: nextY, width: nextW, height: nextH });
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
    [geometry, onResize, disabled],
  );

  if (disabled) return null;

  return (
    <>
      {HANDLES.map((handle) => (
        <div
          key={handle.dir}
          data-testid={`resize-handle-${handle.dir}`}
          className={`absolute z-20 touch-none select-none ${handle.className}`}
          style={{ cursor: handle.cursor }}
          onPointerDown={(e) => startResizing(handle.dir, e)}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
