export type TerminalLayoutMode = 'splits' | 'fat' | 'tall' | 'grid' | 'stack';

export type ToolbeltTab = 'history' | 'bookmarks' | 'directories' | 'jobs' | 'secrets';

export interface CommandBlockItem {
  id: string;
  command: string;
  cwd: string;
  output: string;
  start_time?: string;
  duration_ms?: number;
  exit_code?: number;
  is_folded: boolean;
}

export interface QuickSelectHint {
  hint: string;
  text: string;
  type: 'url' | 'git_hash' | 'ip' | 'path' | 'uuid';
  col: number;
  row: number;
}

export interface TerminalPaneConfig {
  id: string;
  title: string;
  sessionId?: string;
  cwd?: string;
  branch?: string;
  isActive: boolean;
  isZoomed?: boolean;
}

export interface TerminalTabConfig {
  id: string;
  title: string;
  panes: TerminalPaneConfig[];
  activePaneId: string;
  layout: TerminalLayoutMode;
  previousLayout?: TerminalLayoutMode;
}

export interface HistoryEntry {
  id: string;
  command: string;
  cwd: string;
  timestamp: number;
  exitCode?: number;
  durationMs?: number;
  isStarred?: boolean;
}

export interface BookmarkEntry {
  id: string;
  command: string;
  description: string;
  category: string;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  path: string;
  lastVisited: number;
}

export interface JobEntry {
  id: string;
  pid: number;
  command: string;
  cpuPercent: number;
  memoryMb: number;
  status: 'running' | 'sleeping' | 'stopped';
}

export interface SecretEntry {
  id: string;
  name: string;
  account: string;
  preview: string;
}

export interface CommandPaletteAction {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Splits & Layouts' | 'Navigation & Tabs' | 'Productivity' | 'Canvas & Tools';
  shortcut?: string;
  icon?: string;
}
