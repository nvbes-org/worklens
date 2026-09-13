import { createContext, type ReactNode, useContext, useState } from 'react';

type Preferences = {
  sidebarCollapsed: boolean;
  reduceMotion: boolean;
  compact: boolean;
  startView: 'overview' | 'architecture' | 'git';
};
const defaults: Preferences = {
  sidebarCollapsed: false,
  reduceMotion: false,
  compact: false,
  startView: 'overview',
};
const key = 'worklens.appearance.v1';
function read(): Preferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    const saved = value as Record<string, unknown>;
    return {
      sidebarCollapsed: saved.sidebarCollapsed === true,
      reduceMotion: saved.reduceMotion === true,
      compact: saved.compact === true,
      startView:
        saved.startView === 'git' || saved.startView === 'architecture' ? saved.startView : 'overview',
    };
  } catch {
    return defaults;
  }
}
const Context = createContext<{
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
  storageError: string;
} | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(read);
  const [storageError, setStorageError] = useState('');
  function update(patch: Partial<Preferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStorageError('');
    } catch {
      setStorageError('Preferences apply for this session, but could not be saved.');
    }
  }
  return <Context.Provider value={{ preferences, update, storageError }}>{children}</Context.Provider>;
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing preferences provider');
  return value;
}
