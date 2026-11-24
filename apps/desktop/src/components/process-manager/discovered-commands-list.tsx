import { Bug, FolderCode, Package, Play, Search, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DebugMode, DiscoveredCommand } from '@worklens/contracts';

interface DiscoveredCommandsListProps {
  commands: DiscoveredCommand[];
  isLoading: boolean;
  onRunCommand: (command: DiscoveredCommand, debugMode: DebugMode) => void;
}

export function DiscoveredCommandsList({
  commands,
  isLoading,
  onRunCommand,
}: DiscoveredCommandsListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return commands;
    const q = search.toLowerCase();
    return commands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.componentName.toLowerCase().includes(q) ||
        c.command.toLowerCase().includes(q),
    );
  }, [commands, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, DiscoveredCommand[]>();
    for (const cmd of filtered) {
      const key = `${cmd.componentName} (${cmd.ecosystem})`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(cmd);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="flex flex-col h-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] overflow-hidden">
      {/* Search Header */}
      <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands, packages, scripts..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">
            Scanning package.json and Cargo.toml...
          </div>
        ) : grouped.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">
            No runnable commands found matching &quot;{search}&quot;.
          </div>
        ) : (
          grouped.map(([groupName, cmds]) => (
            <div key={groupName} className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] px-1">
                {groupName.includes('cargo') ? (
                  <FolderCode className="size-3.5 text-amber-400" />
                ) : (
                  <Package className="size-3.5 text-emerald-400" />
                )}
                <span>{groupName}</span>
                <span className="text-[10px] text-[var(--text-muted)] font-normal">
                  ({cmds[0].componentPath || 'root'})
                </span>
              </div>

              <div className="space-y-1">
                {cmds.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-active)] transition-colors group"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium text-[var(--text-primary)]">
                          {cmd.name}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                          {cmd.command}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      {cmd.suggestedDebugMode !== 'none' && (
                        <button
                          type="button"
                          onClick={() => onRunCommand(cmd, cmd.suggestedDebugMode)}
                          className="px-2 py-1 text-xs rounded border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors flex items-center gap-1"
                          title={`Run with ${cmd.suggestedDebugMode} debugger`}
                        >
                          <Bug className="size-3" />
                          <span>Debug</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onRunCommand(cmd, 'none')}
                        className="px-2.5 py-1 text-xs rounded bg-[var(--accent)] text-white hover:opacity-90 transition-opacity flex items-center gap-1 font-medium shadow-sm"
                        title="Run command"
                      >
                        <Play className="size-3 fill-current" />
                        <span>Run</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
