import { ArrowDown, ArrowUp, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onFindNext?: (query: string, caseSensitive: boolean, isRegex: boolean) => void;
  onFindPrev?: (query: string, caseSensitive: boolean, isRegex: boolean) => void;
  totalMatches?: number;
  currentMatchIndex?: number;
}

export function AuroraSearchOverlay({
  isOpen,
  onClose,
  onFindNext,
  onFindPrev,
  totalMatches = 0,
  currentMatchIndex = 0,
}: Props) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onFindPrev?.(query, caseSensitive, isRegex);
      } else {
        onFindNext?.(query, caseSensitive, isRegex);
      }
    }
  }

  if (!isOpen) return null;

  return (
    <div className="absolute top-10 right-4 z-40 bg-[#090d16]/95 border border-white/15 rounded-lg shadow-2xl p-1.5 flex items-center gap-1.5 backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-100 font-sans text-xs">
      <div className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.04] border border-white/10 rounded-md">
        <Search className="size-3.5 text-cyan-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onFindNext?.(e.target.value, caseSensitive, isRegex);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Find in terminal..."
          className="bg-transparent text-slate-100 placeholder-slate-500 text-xs w-48 focus:outline-none"
        />

        {query && (
          <span className="text-[10px] text-slate-400 font-mono px-1">
            {totalMatches > 0 ? `${currentMatchIndex + 1} of ${totalMatches}` : '0 of 0'}
          </span>
        )}
      </div>

      {/* Case Sensitive Option */}
      <button
        type="button"
        onClick={() => setCaseSensitive(!caseSensitive)}
        className={`px-1.5 py-1 rounded text-[11px] font-mono font-bold transition-colors ${
          caseSensitive
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
            : 'text-slate-400 hover:bg-white/10'
        }`}
        title="Match Case (Alt+C)"
      >
        Aa
      </button>

      {/* Regex Option */}
      <button
        type="button"
        onClick={() => setIsRegex(!isRegex)}
        className={`px-1.5 py-1 rounded text-[11px] font-mono font-bold transition-colors ${
          isRegex
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
            : 'text-slate-400 hover:bg-white/10'
        }`}
        title="Use Regular Expression (Alt+R)"
      >
        .*
      </button>

      <div className="h-4 w-px bg-white/10 mx-0.5" />

      {/* Navigation Up / Down */}
      <button
        type="button"
        onClick={() => onFindPrev?.(query, caseSensitive, isRegex)}
        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
        title="Previous Match (Shift+Enter)"
      >
        <ArrowUp className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onFindNext?.(query, caseSensitive, isRegex)}
        className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
        title="Next Match (Enter)"
      >
        <ArrowDown className="size-3.5" />
      </button>

      {/* Close Button */}
      <button
        type="button"
        onClick={onClose}
        className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-white/10 transition-colors ml-0.5"
        title="Close (Escape)"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
