import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isTauri } from '@tauri-apps/api/core';
import type {
  FileChangeEvent,
  GitSnapshot,
  Graph,
  JsonValue,
  Operation,
  Repository,
} from '@worklens/contracts';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { query, unwatchRepository, watchRepository } from './api';

const SessionContext = createContext<{
  repo: Repository | null;
  open: (path: string) => Promise<boolean>;
  error: string;
  setRepo: (repo: Repository) => void;
  lastChange: FileChangeEvent | null;
  isWatching: boolean;
} | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [error, setError] = useState('');
  const [lastChange, setLastChange] = useState<FileChangeEvent | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const client = useQueryClient();

  useEffect(() => {
    if (!repo?.path) {
      setIsWatching(false);
      setLastChange(null);
      void unwatchRepository();
      return;
    }

    let unlisten: (() => void) | undefined;
    let active = true;

    async function setupWatcher(path: string) {
      if (isTauri()) {
        try {
          await watchRepository(path);
          if (active) setIsWatching(true);
          const { listen } = await import('@tauri-apps/api/event');
          const unsub = await listen<FileChangeEvent[]>('worklens:file-change', (event) => {
            if (!active) return;
            const events = event.payload;
            if (events && events.length > 0) {
              setLastChange(events[events.length - 1]);
              void client.invalidateQueries({ queryKey: ['git'] });
              void client.invalidateQueries({ queryKey: ['history'] });
              void client.invalidateQueries({ queryKey: ['documents'] });
              void client.invalidateQueries({ queryKey: ['status'] });
            }
          });
          if (active) unlisten = unsub;
          else unsub();
        } catch {
          if (active) setIsWatching(false);
        }
      } else {
        if (active) setIsWatching(true);
      }
    }

    void setupWatcher(repo.path);

    const handleCustomEvent = (e: Event) => {
      const custom = e as CustomEvent<FileChangeEvent[]>;
      const events = custom.detail;
      if (events && events.length > 0) {
        setLastChange(events[events.length - 1]);
        void client.invalidateQueries({ queryKey: ['git'] });
        void client.invalidateQueries({ queryKey: ['history'] });
        void client.invalidateQueries({ queryKey: ['documents'] });
        void client.invalidateQueries({ queryKey: ['status'] });
      }
    };
    window.addEventListener('worklens:file-change', handleCustomEvent);

    return () => {
      active = false;
      window.removeEventListener('worklens:file-change', handleCustomEvent);
      if (unlisten) unlisten();
      void unwatchRepository();
    };
  }, [repo?.path, client]);

  async function open(path: string) {
    if (!path.trim()) return false;
    try {
      const repo = await query<Repository>('open', path);
      setRepo(repo);
      setError('');
      await client.invalidateQueries({ queryKey: ['recent'] });
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }

  return (
    <SessionContext.Provider value={{ repo, open, error, setRepo, lastChange, isWatching }}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Missing session');
  return session;
}
export function useData<T>(operation: Operation, params: JsonValue = {}, interval = 0, enabled = true) {
  const { repo } = useSession();
  return useQuery({
    queryKey: [operation, repo?.path, params],
    queryFn: () => query<T>(operation, repo?.path ?? null, params),
    enabled: Boolean(repo) && enabled,
    refetchInterval: interval || false,
    refetchIntervalInBackground: false,
  });
}
export function useGit() {
  return useData<GitSnapshot>('git', {}, 15_000);
}
export function useGraph(includeVendors = false) {
  return useData<Graph>('graph', includeVendors ? { includeVendors: true } : {});
}
