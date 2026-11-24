import { isTauri } from '@tauri-apps/api/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { loadInstanceFromDisk, removeInstanceFromDisk, saveInstanceToDisk } from './disk-storage';
import type {
  CreateWindowOptions,
  WindowCloseMode,
  WindowGeometry,
  WindowInstance,
  WindowManagerContextValue,
  WindowState,
} from './types';
import { broadcastWindowEvent, subscribeToWindowBus } from './window-bus';
import { renderWindowContent } from './window-renderer';
import {
  DEFAULT_GEOMETRY,
  loadDetachedSnapshot,
  loadDiskFrozenInstances,
  removeDetachedSnapshot,
  saveDetachedSnapshot,
} from './window-sync';

const WindowManagerContext = createContext<WindowManagerContextValue | null>(null);

interface WindowManagerProviderProps {
  children: ReactNode;
  initialWindows?: CreateWindowOptions[];
}

export function WindowManagerProvider({ children, initialWindows = [] }: WindowManagerProviderProps) {
  const [instances, setInstances] = useState<WindowInstance[]>([]);
  const [focusStack, setFocusStack] = useState<string[]>([]);
  const renderersRef = useRef<Map<string, (instance: WindowInstance) => ReactNode>>(new Map());

  // Focus a window instance
  const focusWindow = useCallback((id: string) => {
    setFocusStack((prev) => [id, ...prev.filter((item) => item !== id)]);
    setInstances((prev) =>
      prev.map((inst) => (inst.id === id ? { ...inst, lastActiveAt: Date.now() } : inst)),
    );
  }, []);

  // Create a new window instance
  const createWindow = useCallback(
    <T = Record<string, unknown>>(options: CreateWindowOptions<T>): string => {
      const id = options.id ?? `win_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const cascadeOffset = (instances.length % 8) * 28;

      const newInstance: WindowInstance = {
        id,
        title: options.title,
        subtitle: options.subtitle,
        iconName: options.iconName,
        dockMode: options.dockMode ?? 'floating',
        dockSlot: options.dockSlot ?? 'main',
        state: 'visible',
        isAlwaysOnTop: options.isAlwaysOnTop ?? false,
        geometry: {
          ...DEFAULT_GEOMETRY,
          x: (options.geometry?.x ?? DEFAULT_GEOMETRY.x) + cascadeOffset,
          y: (options.geometry?.y ?? DEFAULT_GEOMETRY.y) + cascadeOffset,
          width: options.geometry?.width ?? DEFAULT_GEOMETRY.width,
          height: options.geometry?.height ?? DEFAULT_GEOMETRY.height,
          minWidth: options.geometry?.minWidth ?? DEFAULT_GEOMETRY.minWidth,
          minHeight: options.geometry?.minHeight ?? DEFAULT_GEOMETRY.minHeight,
        },
        data: (options.initialData ?? {}) as Record<string, unknown>,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        rendererId: options.rendererId,
      };

      setInstances((prev) => [...prev.filter((w) => w.id !== id), newInstance]);
      setFocusStack((prev) => [id, ...prev.filter((item) => item !== id)]);
      return id;
    },
    [instances.length],
  );

  // Close window with chosen mode (terminate, keep_active, freeze_to_disk)
  const closeWindow = useCallback(
    async (id: string, mode: WindowCloseMode): Promise<void> => {
      const target = instances.find((w) => w.id === id);
      if (!target) return;

      removeDetachedSnapshot(id);
      if (target.dockMode === 'native_detached' && isTauri()) {
        void import('@tauri-apps/api/core').then(({ invoke }) => {
          void invoke('close_native_window', { id });
        });
      }

      if (mode === 'terminate') {
        await removeInstanceFromDisk(id);
        setInstances((prev) => prev.filter((w) => w.id !== id));
        setFocusStack((prev) => prev.filter((item) => item !== id));
        return;
      }

      if (mode === 'keep_active') {
        setInstances((prev) =>
          prev.map((w) => (w.id === id ? { ...w, state: 'hidden', lastActiveAt: Date.now() } : w)),
        );
        setFocusStack((prev) => prev.filter((item) => item !== id));
        return;
      }

      if (mode === 'freeze_to_disk') {
        const diskMeta = await saveInstanceToDisk(id, {
          id: target.id,
          title: target.title,
          subtitle: target.subtitle,
          iconName: target.iconName,
          dockMode: target.dockMode,
          dockSlot: target.dockSlot,
          isAlwaysOnTop: target.isAlwaysOnTop,
          geometry: target.geometry,
          rendererId: target.rendererId,
          data: target.data,
        });

        setInstances((prev) =>
          prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  state: 'frozen',
                  diskMetadata: diskMeta,
                  data: {},
                  lastActiveAt: Date.now(),
                }
              : w,
          ),
        );
        setFocusStack((prev) => prev.filter((item) => item !== id));
      }
    },
    [instances],
  );

  // Restore/unfreeze a window
  const restoreWindow = useCallback(
    async (id: string): Promise<void> => {
      const target = instances.find((w) => w.id === id);
      if (!target) return;

      if (target.state === 'frozen') {
        const persisted = await loadInstanceFromDisk(id);
        if (persisted) {
          setInstances((prev) =>
            prev.map((w) =>
              w.id === id
                ? {
                    ...w,
                    state: 'visible',
                    data: persisted.data,
                    geometry: persisted.geometry,
                    dockMode: persisted.dockMode,
                    isAlwaysOnTop: persisted.isAlwaysOnTop,
                    lastActiveAt: Date.now(),
                  }
                : w,
            ),
          );
        } else {
          setInstances((prev) =>
            prev.map((w) => (w.id === id ? { ...w, state: 'visible', lastActiveAt: Date.now() } : w)),
          );
        }
      } else {
        setInstances((prev) =>
          prev.map((w) => (w.id === id ? { ...w, state: 'visible', lastActiveAt: Date.now() } : w)),
        );
      }

      focusWindow(id);
    },
    [instances, focusWindow],
  );

  // Duplicate an existing window
  const duplicateWindow = useCallback(
    (id: string): string | null => {
      const source = instances.find((w) => w.id === id);
      if (!source) return null;

      const newId = `${source.id}_copy_${Date.now().toString(36)}`;
      const duplicated: WindowInstance = {
        ...source,
        id: newId,
        title: `${source.title} (Copie)`,
        dockMode: 'floating',
        state: 'visible',
        geometry: {
          ...source.geometry,
          x: source.geometry.x + 32,
          y: source.geometry.y + 32,
          isMinimized: false,
          isMaximized: false,
        },
        data: structuredClone(source.data),
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        diskMetadata: undefined,
      };

      setInstances((prev) => [...prev, duplicated]);
      focusWindow(newId);
      return newId;
    },
    [instances, focusWindow],
  );

  // Toggle always-on-top focus
  const toggleAlwaysOnTop = useCallback((id: string) => {
    setInstances((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const nextAlways = !w.isAlwaysOnTop;
        if (w.dockMode === 'native_detached' && isTauri()) {
          void import('@tauri-apps/api/core').then(({ invoke }) => {
            void invoke('set_native_window_always_on_top', { id, alwaysOnTop: nextAlways });
          });
        }
        broadcastWindowEvent({ type: 'WINDOW_PIN_TOGGLE', id, isAlwaysOnTop: nextAlways });
        return { ...w, isAlwaysOnTop: nextAlways };
      }),
    );
  }, []);

  // Toggle docked vs floating mode
  const toggleDock = useCallback((id: string, targetSlot?: string) => {
    setInstances((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        const nextMode = w.dockMode === 'docked' ? 'floating' : 'docked';
        return {
          ...w,
          dockMode: nextMode,
          dockSlot: targetSlot ?? w.dockSlot,
        };
      }),
    );
  }, []);

  // Detach to native OS window (Tauri WebviewWindow)
  const detachToNativeWindow = useCallback(
    async (id: string): Promise<void> => {
      const target = instances.find((w) => w.id === id);
      if (!target) return;

      const detachedInstance: WindowInstance = {
        ...target,
        dockMode: 'native_detached',
        state: 'visible',
      };
      saveDetachedSnapshot(detachedInstance);

      if (isTauri()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('create_native_window', {
            id: target.id,
            title: target.title,
            url: `/?detachedWindowId=${encodeURIComponent(target.id)}`,
            width: target.geometry.width,
            height: target.geometry.height,
            x: target.geometry.x,
            y: target.geometry.y,
            alwaysOnTop: target.isAlwaysOnTop,
          });
        } catch (err) {
          console.error('Failed to create native window:', err);
        }
      }

      setInstances((prev) => prev.map((w) => (w.id === id ? detachedInstance : w)));
    },
    [instances],
  );

  // Re-attach native window back into the main application dock slot
  const reattachFromNative = useCallback(
    async (id: string, targetSlot?: string): Promise<void> => {
      removeDetachedSnapshot(id);
      if (isTauri()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('close_native_window', { id });
        } catch {
          // ignore
        }
      }

      setInstances((prev) =>
        prev.map((w) =>
          w.id === id
            ? {
                ...w,
                dockMode: 'docked',
                dockSlot: targetSlot ?? w.dockSlot,
                state: 'visible',
              }
            : w,
        ),
      );
      focusWindow(id);
    },
    [focusWindow],
  );

  // Update window geometry
  const updateGeometry = useCallback((id: string, updates: Partial<WindowGeometry>) => {
    setInstances((prev) =>
      prev.map((w) => (w.id === id ? { ...w, geometry: { ...w.geometry, ...updates } } : w)),
    );
  }, []);

  // Update instance data
  const updateInstanceData = useCallback(
    <T = Record<string, unknown>>(id: string, updater: (prev: T) => T) => {
      setInstances((prev) =>
        prev.map((w) => {
          if (w.id !== id) return w;
          const nextData = updater(w.data as T) as Record<string, unknown>;
          return { ...w, data: nextData, lastActiveAt: Date.now() };
        }),
      );
    },
    [],
  );

  // Synchronize on mount with frozen instances in disk storage
  useEffect(() => {
    const existingIds = new Set(instances.map((w) => w.id));
    void loadDiskFrozenInstances(existingIds).then((frozen) => {
      if (!frozen.length) return;
      setInstances((current) => {
        const currentIds = new Set(current.map((w) => w.id));
        const missing = frozen.filter((f) => !currentIds.has(f.id));
        return missing.length ? [...current, ...missing] : current;
      });
    });
  }, []);

  // Detached window initialization (if launched as native OS window)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const detachedId = new URLSearchParams(window.location.search).get('detachedWindowId');
    if (!detachedId) return;

    const snapshot = loadDetachedSnapshot(detachedId);
    if (snapshot) {
      setInstances((prev) => {
        if (prev.some((w) => w.id === detachedId)) return prev;
        return [...prev, snapshot];
      });
      setFocusStack((prev) => (prev.includes(detachedId) ? prev : [detachedId, ...prev]));
    }
    broadcastWindowEvent({ type: 'WINDOW_REQUEST_SYNC', id: detachedId });
  }, []);

  // Initialize initial windows if provided
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current || !initialWindows.length) return;
    initRef.current = true;
    for (const opt of initialWindows) {
      createWindow(opt);
    }
  }, [initialWindows, createWindow]);

  // Renderer registration & rendering
  const registerRenderer = useCallback((id: string, renderer: (instance: WindowInstance) => ReactNode) => {
    renderersRef.current.set(id, renderer);
    return () => {
      renderersRef.current.delete(id);
    };
  }, []);

  const renderContent = useCallback((instance: WindowInstance): ReactNode => {
    return renderWindowContent(instance, renderersRef.current);
  }, []);

  const getInstancesByState = useCallback(
    (state: WindowState) => instances.filter((inst) => inst.state === state),
    [instances],
  );

  const getInstancesBySlot = useCallback(
    (slot: string) =>
      instances.filter(
        (inst) => inst.dockSlot === slot && inst.dockMode === 'docked' && inst.state === 'visible',
      ),
    [instances],
  );

  // Listen to cross-window bus events (detached native windows syncing with main window)
  useEffect(() => {
    const unsubscribe = subscribeToWindowBus((msg) => {
      if (msg.type === 'WINDOW_ATTACH_REQUEST') {
        void reattachFromNative(msg.id);
      } else if (msg.type === 'WINDOW_STATE_SYNC') {
        updateInstanceData(msg.id, () => msg.data);
      } else if (msg.type === 'WINDOW_ACTION_CLOSE') {
        void closeWindow(msg.id, msg.mode);
      } else if (msg.type === 'WINDOW_ACTION_DUPLICATE') {
        duplicateWindow(msg.id);
      } else if (msg.type === 'WINDOW_PIN_TOGGLE') {
        setInstances((prev) =>
          prev.map((w) => (w.id === msg.id ? { ...w, isAlwaysOnTop: msg.isAlwaysOnTop } : w)),
        );
      } else if (msg.type === 'WINDOW_NATIVE_CLOSED') {
        setInstances((prev) => prev.map((w) => (w.id === msg.id ? { ...w, state: 'hidden' } : w)));
      } else if (msg.type === 'WINDOW_REQUEST_SYNC') {
        const target = instances.find((w) => w.id === msg.id);
        if (target) {
          broadcastWindowEvent({ type: 'WINDOW_SYNC_INSTANCE', instance: target });
        }
      } else if (msg.type === 'WINDOW_SYNC_INSTANCE') {
        setInstances((prev) => {
          const exists = prev.some((w) => w.id === msg.instance.id);
          if (exists) {
            return prev.map((w) => (w.id === msg.instance.id ? msg.instance : w));
          }
          return [...prev, msg.instance];
        });
      }
    });
    return unsubscribe;
  }, [reattachFromNative, updateInstanceData, closeWindow, duplicateWindow, instances]);

  const value: WindowManagerContextValue = useMemo(
    () => ({
      instances,
      activeInstanceId: focusStack[0] ?? null,
      focusedInstanceId: focusStack[0] ?? null,
      createWindow,
      closeWindow,
      restoreWindow,
      duplicateWindow,
      toggleAlwaysOnTop,
      toggleDock,
      detachToNativeWindow,
      reattachFromNative,
      focusWindow,
      updateGeometry,
      updateInstanceData,
      freezeInstance: (id) => closeWindow(id, 'freeze_to_disk'),
      unfreezeInstance: restoreWindow,
      terminateInstance: (id) => closeWindow(id, 'terminate'),
      getInstancesByState,
      getInstancesBySlot,
      registerRenderer,
      renderContent,
    }),
    [
      instances,
      focusStack,
      createWindow,
      closeWindow,
      restoreWindow,
      duplicateWindow,
      toggleAlwaysOnTop,
      toggleDock,
      detachToNativeWindow,
      reattachFromNative,
      focusWindow,
      updateGeometry,
      updateInstanceData,
      getInstancesByState,
      getInstancesBySlot,
      registerRenderer,
      renderContent,
    ],
  );

  return <WindowManagerContext.Provider value={value}>{children}</WindowManagerContext.Provider>;
}

export function useWindowManager(): WindowManagerContextValue {
  const ctx = useContext(WindowManagerContext);
  if (!ctx) {
    throw new Error('useWindowManager must be used within a WindowManagerProvider');
  }
  return ctx;
}
