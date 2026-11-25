import { useQuery } from '@tanstack/react-query';
import { FileCode, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { query } from '../../lib/api';
import { useSession } from '../../lib/session';

interface FuzzyFileFinderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFile: (path: string) => void;
}

function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;
  if (t === q) return 1000;
  if (t.includes(q)) return 500 + (100 - t.indexOf(q));

  let qIdx = 0;
  let score = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === q[qIdx]) {
      score += 10;
      if (i > 0 && (t[i - 1] === '/' || t[i - 1] === '.' || t[i - 1] === '-' || t[i - 1] === '_')) {
        score += 25; // Bonus for match after delimiter
      }
      qIdx++;
      if (qIdx === q.length) return score;
    }
  }
  return null;
}

export function FuzzyFileFinder({ open, onOpenChange, onSelectFile }: FuzzyFileFinderProps) {
  const { repo } = useSession();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  const filesQuery = useQuery({
    queryKey: ['file_list', repo?.path],
    queryFn: () => query<string[]>('file_list', repo?.path),
    enabled: Boolean(repo && open),
  });

  const files = filesQuery.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return files.slice(0, 50);
    const scored: { path: string; score: number }[] = [];
    for (const f of files) {
      const s = fuzzyScore(search.trim(), f);
      if (s !== null) scored.push({ path: f, score: s });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 50).map((item) => item.path);
  }, [files, search]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  function handleSelect(path: string) {
    onSelectFile(path);
    onOpenChange(false);
    setSearch('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-background/80 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl bg-card border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Search header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/40">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Type a file name or path (e.g. app.tsx, Cargo.toml)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && filtered[selectedIndex]) {
                e.preventDefault();
                handleSelect(filtered[selectedIndex]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onOpenChange(false);
              }
            }}
            ref={inputRef}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
          <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">ESC</span>
        </div>

        {/* Files list */}
        <div className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
          {filesQuery.isPending ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Indexing repository files...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No matching files found.</div>
          ) : (
            filtered.map((path, index) => {
              const fileName = path.split('/').pop() ?? path;
              const dirName = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => handleSelect(path)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg text-left transition-colors cursor-pointer ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/70 text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileCode
                      className={`size-3.5 shrink-0 ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                    />
                    <span className="font-medium truncate">{fileName}</span>
                    {dirName && (
                      <span
                        className={`text-[11px] truncate ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
                      >
                        {dirName}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{filtered.length} files listed</span>
          <span>Use ↑↓ to navigate · Enter to open</span>
        </div>
      </div>
    </div>
  );
}
