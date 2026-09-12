import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GitSnapshot, Graph, JsonValue, Operation, Repository } from '@worklens/contracts';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { query } from './api';

const SessionContext = createContext<{
  repo: Repository | null;
  open: (path: string) => Promise<boolean>;
  error: string;
  setRepo: (repo: Repository) => void;
} | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [error, setError] = useState('');
  const client = useQueryClient();
  async function open(path: string) {
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
  return <SessionContext.Provider value={{ repo, open, error, setRepo }}>{children}</SessionContext.Provider>;
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
export function useGraph() {
  return useData<Graph>('graph');
}
