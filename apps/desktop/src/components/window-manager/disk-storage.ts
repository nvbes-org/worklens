import type { DiskPersistedPayload, DiskStorageMetadata } from './types';

const DISK_SWAP_PREFIX = 'worklens:window-disk-swap:';
const DISK_INDEX_KEY = 'worklens:window-disk-index';

interface DiskIndexEntry {
  id: string;
  storageKey: string;
  byteSize: number;
  savedAt: number;
  title: string;
}

/**
 * Reads the disk index safely.
 */
function readDiskIndex(): DiskIndexEntry[] {
  try {
    const raw = localStorage.getItem(DISK_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiskIndexEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Writes the disk index safely.
 */
function writeDiskIndex(entries: DiskIndexEntry[]): void {
  try {
    localStorage.setItem(DISK_INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Disk write might fail if quota exceeded
  }
}

/**
 * Serializes and writes a window instance payload to persistent hard disk storage.
 * Measures exact byte footprint and updates disk index.
 */
export async function saveInstanceToDisk<T = Record<string, unknown>>(
  instanceId: string,
  payload: Omit<DiskPersistedPayload<T>, 'savedAt' | 'version'>,
): Promise<DiskStorageMetadata> {
  const savedAt = Date.now();
  const version = 1;
  const storageKey = `${DISK_SWAP_PREFIX}${instanceId}`;

  const fullPayload: DiskPersistedPayload<T> = {
    ...payload,
    savedAt,
    version,
  };

  const serialized = JSON.stringify(fullPayload);
  const byteSize = new TextEncoder().encode(serialized).length;

  try {
    localStorage.setItem(storageKey, serialized);
  } catch (error) {
    throw new Error(`Failed to persist window "${instanceId}" to disk: ${String(error)}`);
  }

  // Update index
  const index = readDiskIndex().filter((entry) => entry.id !== instanceId);
  index.push({
    id: instanceId,
    storageKey,
    byteSize,
    savedAt,
    title: payload.title,
  });
  writeDiskIndex(index);

  return {
    storageKey,
    byteSize,
    savedAt,
    version,
  };
}

/**
 * Loads a frozen window instance payload from hard disk.
 */
export async function loadInstanceFromDisk<T = Record<string, unknown>>(
  instanceId: string,
): Promise<DiskPersistedPayload<T> | null> {
  const storageKey = `${DISK_SWAP_PREFIX}${instanceId}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as DiskPersistedPayload<T>;
  } catch {
    return null;
  }
}

/**
 * Deletes a frozen window instance from hard disk and removes it from the index.
 */
export async function removeInstanceFromDisk(instanceId: string): Promise<void> {
  const storageKey = `${DISK_SWAP_PREFIX}${instanceId}`;
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage deletion errors
  }

  const index = readDiskIndex().filter((entry) => entry.id !== instanceId);
  writeDiskIndex(index);
}

/**
 * Lists all window instances currently swapped and frozen on hard disk.
 */
export async function listDiskInstances(): Promise<DiskIndexEntry[]> {
  return readDiskIndex();
}

/**
 * Purges all frozen window instances stored on hard disk.
 */
export async function clearAllDiskInstances(): Promise<void> {
  const index = readDiskIndex();
  for (const entry of index) {
    try {
      localStorage.removeItem(entry.storageKey);
    } catch {
      // Ignore cleanup error
    }
  }
  try {
    localStorage.removeItem(DISK_INDEX_KEY);
  } catch {
    // Ignore cleanup error
  }
}

/**
 * Formats byte size into human-readable format (e.g. "14.2 KB").
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
