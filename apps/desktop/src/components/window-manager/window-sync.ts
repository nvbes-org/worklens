import { listDiskInstances } from './disk-storage';
import type { WindowGeometry, WindowInstance } from './types';

export const DEFAULT_GEOMETRY: WindowGeometry = {
  x: 80,
  y: 60,
  width: 480,
  height: 340,
  minWidth: 320,
  minHeight: 200,
  isMinimized: false,
  isMaximized: false,
};

const DETACHED_KEY_PREFIX = 'worklens:detached:';

export function saveDetachedSnapshot(instance: WindowInstance): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(`${DETACHED_KEY_PREFIX}${instance.id}`, JSON.stringify(instance));
  } catch {
    // Ignore storage quota or disabled errors
  }
}

export function removeDetachedSnapshot(id: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(`${DETACHED_KEY_PREFIX}${id}`);
  } catch {
    // Ignore
  }
}

export function loadDetachedSnapshot(id: string): WindowInstance | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(`${DETACHED_KEY_PREFIX}${id}`);
    if (raw) {
      return JSON.parse(raw) as WindowInstance;
    }
  } catch {
    // Ignore parse errors
  }

  // Graceful fallback for direct navigation or test runners
  return {
    id,
    title: 'Fenêtre détachée',
    dockMode: 'native_detached',
    dockSlot: 'main',
    state: 'visible',
    isAlwaysOnTop: false,
    geometry: DEFAULT_GEOMETRY,
    data: {},
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

export async function loadDiskFrozenInstances(existingIds: Set<string>): Promise<WindowInstance[]> {
  const diskEntries = await listDiskInstances();
  if (!diskEntries.length) return [];

  return diskEntries
    .filter((entry) => !existingIds.has(entry.id))
    .map(
      (entry): WindowInstance => ({
        id: entry.id,
        title: entry.title || 'Fenêtre figée sur disque',
        dockMode: 'floating',
        dockSlot: 'main',
        state: 'frozen',
        isAlwaysOnTop: false,
        geometry: DEFAULT_GEOMETRY,
        data: {},
        createdAt: entry.savedAt,
        lastActiveAt: entry.savedAt,
        diskMetadata: {
          storageKey: entry.storageKey,
          byteSize: entry.byteSize,
          savedAt: entry.savedAt,
          version: 1,
        },
      }),
    );
}
