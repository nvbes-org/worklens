import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { query } from './api';

export type Theme = 'system' | 'light' | 'dark';

type Preferences = {
  sidebarCollapsed: boolean;
  reduceMotion: boolean;
  compact: boolean;
  startView: 'overview' | 'architecture' | 'git';
  theme: Theme;
};
const defaults: Preferences = {
  sidebarCollapsed: false,
  reduceMotion: false,
  compact: false,
  startView: 'overview',
  theme: 'system',
};
const key = 'worklens.appearance.v1';

function applyDocumentTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const isDark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  }
}

function read(): Preferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    const saved = value as Record<string, unknown>;
    const loadedTheme: Theme =
      saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system'
        ? (saved.theme as Theme)
        : 'system';
    applyDocumentTheme(loadedTheme);
    return {
      sidebarCollapsed: saved.sidebarCollapsed === true,
      reduceMotion: saved.reduceMotion === true,
      compact: saved.compact === true,
      startView:
        saved.startView === 'git' || saved.startView === 'architecture' ? saved.startView : 'overview',
      theme: loadedTheme,
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

  useEffect(() => {
    query<Partial<Preferences> | null>('preferences_get', null, { key: 'appearance' })
      .then((remote) => {
        if (remote && typeof remote === 'object') {
          setPreferences((prev) => {
            const merged = { ...prev, ...remote };
            applyDocumentTheme(merged.theme);
            return merged;
          });
        }
      })
      .catch(() => {
        // Fallback to local
      });
  }, []);

  useEffect(() => {
    applyDocumentTheme(preferences.theme);
    if (preferences.theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyDocumentTheme('system');
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [preferences.theme]);

  function update(patch: Partial<Preferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    if (patch.theme !== undefined) {
      applyDocumentTheme(patch.theme);
    }
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStorageError('');
    } catch {
      setStorageError('Preferences apply for this session, but could not be saved.');
    }
    query('preferences_set', null, { key: 'appearance', value: next }).catch(() => {
      // Local fallback in place
    });
  }
  return <Context.Provider value={{ preferences, update, storageError }}>{children}</Context.Provider>;
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing preferences provider');
  return value;
}
