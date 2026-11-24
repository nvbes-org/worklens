import { Check, Copy, FolderTree, Key, Play, Trash2, X, Zap } from 'lucide-react';
import { useState } from 'react';
import type {
  BookmarkEntry,
  DirectoryEntry,
  HistoryEntry,
  JobEntry,
  SecretEntry,
  ToolbeltTab,
} from './types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onExecuteCommand?: (cmd: string) => void;
  history?: HistoryEntry[];
  bookmarks?: BookmarkEntry[];
  directories?: DirectoryEntry[];
  jobs?: JobEntry[];
  secrets?: SecretEntry[];
}

import { SAMPLE_BOOKMARKS, SAMPLE_DIRS, SAMPLE_JOBS, SAMPLE_SECRETS } from './toolbelt-data';

export function AuroraToolbelt({
  isOpen,
  onClose,
  onExecuteCommand,
  history = [],
  bookmarks = SAMPLE_BOOKMARKS,
  directories = SAMPLE_DIRS,
  jobs = SAMPLE_JOBS,
  secrets = SAMPLE_SECRETS,
}: Props) {
  const [activeTab, setActiveTab] = useState<ToolbeltTab>('history');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleCopy(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  return (
    <div className="w-80 h-full border-l border-white/10 bg-[#070a12]/95 backdrop-blur-md flex flex-col z-30 select-none text-xs">
      {/* Toolbelt Top Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Zap className="size-3.5 text-cyan-400" />
          <span className="font-semibold text-slate-200">Aurora Toolbelt</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center px-1 border-b border-white/10 bg-black/40 text-[11px]">
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-1.5 font-medium transition-colors border-b-2 ${
            activeTab === 'history'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          History
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bookmarks')}
          className={`flex-1 py-1.5 font-medium transition-colors border-b-2 ${
            activeTab === 'bookmarks'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Bookmarks
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('directories')}
          className={`flex-1 py-1.5 font-medium transition-colors border-b-2 ${
            activeTab === 'directories'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Dirs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('jobs')}
          className={`flex-1 py-1.5 font-medium transition-colors border-b-2 ${
            activeTab === 'jobs'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Jobs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('secrets')}
          className={`flex-1 py-1.5 font-medium transition-colors border-b-2 ${
            activeTab === 'secrets'
              ? 'border-cyan-400 text-cyan-300'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Secrets
        </button>
      </div>

      {/* Tab Content Panels */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {activeTab === 'history' && (
          <div className="space-y-1.5">
            {history.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-[11px]">
                No command history yet. Commands will record as you run them.
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className="group p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-cyan-500/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`size-1.5 rounded-full shrink-0 ${
                          item.exitCode === 0 ? 'bg-emerald-400' : 'bg-rose-400'
                        }`}
                      />
                      <span className="font-mono text-slate-200 truncate">{item.command}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onExecuteCommand?.(item.command)}
                        className="p-1 rounded hover:bg-white/10 text-cyan-400"
                        title="Re-run command"
                      >
                        <Play className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.id, item.command)}
                        className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200"
                        title="Copy command"
                      >
                        {copiedId === item.id ? (
                          <Check className="size-3 text-emerald-400" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="truncate max-w-[140px]">{item.cwd}</span>
                    {item.durationMs && <span>{item.durationMs}ms</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'bookmarks' && (
          <div className="space-y-1.5">
            {bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="group p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-cyan-500/30 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-slate-200 text-xs font-medium">{bm.command}</span>
                  <button
                    type="button"
                    onClick={() => onExecuteCommand?.(bm.command)}
                    className="p-1 rounded hover:bg-white/10 text-cyan-400 opacity-80 group-hover:opacity-100"
                    title="Run bookmark"
                  >
                    <Play className="size-3" />
                  </button>
                </div>
                <div className="text-[10px] text-slate-400">{bm.description}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'directories' && (
          <div className="space-y-1.5">
            {directories.map((dir) => (
              <button
                key={dir.id}
                type="button"
                onClick={() => onExecuteCommand?.(`cd "${dir.path}"`)}
                className="w-full text-left p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <FolderTree className="size-3.5 text-cyan-400" />
                  <span className="font-mono text-slate-200 text-xs">{dir.name}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[120px]">
                  {dir.path}
                </span>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="space-y-1.5">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-mono text-slate-200 text-xs truncate max-w-[160px]">
                      {job.command}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    PID: {job.pid} | CPU: {job.cpuPercent}% | RAM: {job.memoryMb}MB
                  </div>
                </div>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-rose-500/20 text-rose-400 transition-colors"
                  title="Kill job (SIGTERM)"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'secrets' && (
          <div className="space-y-1.5">
            {secrets.map((sec) => (
              <div
                key={sec.id}
                className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06] space-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Key className="size-3 text-amber-400" />
                    <span className="font-mono text-slate-200 text-xs font-semibold">{sec.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(sec.id, sec.preview)}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-slate-200"
                    title="Copy Secret"
                  >
                    {copiedId === sec.id ? (
                      <Check className="size-3 text-emerald-400" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </button>
                </div>
                <div className="text-[10px] text-slate-500">{sec.account}</div>
                <div className="text-[11px] font-mono text-slate-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/5 truncate">
                  {sec.preview}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
