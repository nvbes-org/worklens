import type { ReactNode } from 'react';

/**
 * Lifecycle state of a window instance:
 * - 'visible': Rendered and interactive (docked or floating).
 * - 'hidden': Visually closed but kept active in RAM (timers, processes stay alive).
 * - 'frozen': Suspended, state serialized to hard disk, memory freed.
 * - 'destroyed': Permanently closed, session terminated and disk cache purged.
 */
export type WindowState = 'visible' | 'hidden' | 'frozen' | 'destroyed';

/**
 * Display mode of the window:
 * - 'docked': Integrated / plugged into the main interface (dock slot).
 * - 'floating': Detached, free-floating window over the workspace.
 * - 'native_detached': Detached as an independent native OS window (Tauri WebviewWindow).
 */
export type WindowDockMode = 'docked' | 'floating' | 'native_detached';

/**
 * Strategy chosen when closing a window:
 * - 'terminate': Close and terminate session, purge memory & disk.
 * - 'keep_active': Visually close but keep instance active in memory.
 * - 'freeze_to_disk': Visually close, freeze instance, swap memory to hard disk.
 */
export type WindowCloseMode = 'terminate' | 'keep_active' | 'freeze_to_disk';

/**
 * Coordinates and bounding dimensions of a floating window.
 */
export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  isMinimized?: boolean;
  isMaximized?: boolean;
}

/**
 * Metadata recorded when a window instance is frozen to hard disk.
 */
export interface DiskStorageMetadata {
  storageKey: string;
  byteSize: number;
  savedAt: number;
  version: number;
}

/**
 * Serializable state payload stored on hard disk.
 */
export interface DiskPersistedPayload<T = Record<string, unknown>> {
  id: string;
  title: string;
  subtitle?: string;
  iconName?: string;
  dockMode: WindowDockMode;
  dockSlot: string;
  isAlwaysOnTop: boolean;
  geometry: WindowGeometry;
  rendererId?: string;
  data: T;
  savedAt: number;
  version: number;
}

/**
 * A managed window instance in the window system.
 */
export interface WindowInstance<T = Record<string, unknown>> {
  id: string;
  title: string;
  subtitle?: string;
  iconName?: string;
  dockMode: WindowDockMode;
  dockSlot: string;
  state: WindowState;
  isAlwaysOnTop: boolean;
  geometry: WindowGeometry;
  data: T;
  createdAt: number;
  lastActiveAt: number;
  diskMetadata?: DiskStorageMetadata;
  rendererId?: string;
}

/**
 * Configuration options when spawning a new window.
 */
export interface CreateWindowOptions<T = Record<string, unknown>> {
  id?: string;
  title: string;
  subtitle?: string;
  iconName?: string;
  dockMode?: WindowDockMode;
  dockSlot?: string;
  isAlwaysOnTop?: boolean;
  geometry?: Partial<WindowGeometry>;
  initialData?: T;
  rendererId?: string;
}

/**
 * Contract for the Window Manager context.
 */
export interface WindowManagerContextValue {
  instances: WindowInstance[];
  activeInstanceId: string | null;
  focusedInstanceId: string | null;
  createWindow: <T = Record<string, unknown>>(options: CreateWindowOptions<T>) => string;
  closeWindow: (id: string, mode: WindowCloseMode) => Promise<void>;
  restoreWindow: (id: string) => Promise<void>;
  duplicateWindow: (id: string) => string | null;
  toggleAlwaysOnTop: (id: string) => void;
  toggleDock: (id: string, targetSlot?: string) => void;
  detachToNativeWindow: (id: string) => Promise<void>;
  reattachFromNative: (id: string, targetSlot?: string) => Promise<void>;
  focusWindow: (id: string) => void;
  updateGeometry: (id: string, updates: Partial<WindowGeometry>) => void;
  updateInstanceData: <T = Record<string, unknown>>(id: string, updater: (prev: T) => T) => void;
  freezeInstance: (id: string) => Promise<void>;
  unfreezeInstance: (id: string) => Promise<void>;
  terminateInstance: (id: string) => Promise<void>;
  getInstancesByState: (state: WindowState) => WindowInstance[];
  getInstancesBySlot: (slot: string) => WindowInstance[];
  registerRenderer: (id: string, renderer: (instance: WindowInstance) => ReactNode) => () => void;
  renderContent: (instance: WindowInstance) => ReactNode;
}
