import { Check, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { QuickSelectHint } from './types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  hints?: QuickSelectHint[];
  onSelectHint?: (hint: QuickSelectHint) => void;
}

const DEFAULT_SAMPLE_HINTS: QuickSelectHint[] = [
  { hint: 'aa', text: 'https://github.com/worklens/aurora-term', type: 'url', col: 12, row: 4 },
  { hint: 'ab', text: '7f9a2b4', type: 'git_hash', col: 8, row: 8 },
  { hint: 'ac', text: 'http://localhost:5173', type: 'url', col: 24, row: 12 },
  { hint: 'ad', text: 'apps/desktop/src/components/terminal', type: 'path', col: 4, row: 16 },
  { hint: 'ae', text: '127.0.0.1:8080', type: 'ip', col: 18, row: 20 },
];

export function AuroraQuickSelectOverlay({
  isOpen,
  onClose,
  hints = DEFAULT_SAMPLE_HINTS,
  onSelectHint,
}: Props) {
  const [typedChars, setTypedChars] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTypedChars('');
      setCopiedText(null);
      return;
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        e.preventDefault();
        const next = (typedChars + e.key.toLowerCase()).slice(-2);
        setTypedChars(next);

        const match = hints.find((h) => h.hint.toLowerCase() === next);
        if (match) {
          void navigator.clipboard.writeText(match.text);
          setCopiedText(match.text);
          onSelectHint?.(match);
          setTimeout(() => {
            onClose();
          }, 600);
        }
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, typedChars, hints, onClose, onSelectHint]);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-auto bg-black/40 backdrop-blur-[2px] overflow-hidden flex flex-col justify-between p-4">
      {/* Top Banner Indicator */}
      <div className="self-center flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400 text-black font-semibold text-xs shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
        <Zap className="size-3.5 fill-black" />
        <span>QuickSelect Mode</span>
        <span className="text-[11px] opacity-80 font-normal">Type 2-letter hint to copy or open</span>
        <kbd className="px-1.5 py-0.5 rounded bg-black/20 text-black text-[10px] font-mono ml-2">
          ESC to cancel
        </kbd>
      </div>

      {/* Render Hints Overlays */}
      <div className="relative flex-1 w-full my-4">
        {hints.map((hint) => {
          const isMatched = typedChars === hint.hint;
          const isPrefix = typedChars.length === 1 && hint.hint.startsWith(typedChars);

          return (
            <div
              key={hint.hint}
              style={{
                top: `${hint.row * 24}px`,
                left: `${hint.col * 14}px`,
              }}
              className="absolute z-50 flex items-center gap-1.5 animate-in fade-in duration-100"
            >
              {/* 2-Letter Pill */}
              <button
                type="button"
                className={`px-1.5 py-0.5 rounded text-[11px] font-black font-mono tracking-wider shadow-md transition-all ${
                  isMatched
                    ? 'bg-emerald-400 text-black scale-125'
                    : isPrefix
                      ? 'bg-cyan-400 text-black ring-2 ring-cyan-300'
                      : 'bg-amber-300 text-black hover:bg-amber-400 cursor-pointer'
                }`}
                onClick={() => {
                  void navigator.clipboard.writeText(hint.text);
                  setCopiedText(hint.text);
                  onSelectHint?.(hint);
                  setTimeout(onClose, 600);
                }}
              >
                {hint.hint.toUpperCase()}
              </button>

              {/* Target Highlight */}
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 text-xs font-mono border border-white/20 backdrop-blur-md">
                {hint.text}
              </span>
            </div>
          );
        })}
      </div>

      {/* Bottom Notification if copied */}
      {copiedText && (
        <div className="self-center flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 text-white font-medium text-xs shadow-xl animate-in zoom-in-95 duration-150">
          <Check className="size-4" />
          <span>Copied to clipboard:</span>
          <span className="font-mono text-emerald-100 underline truncate max-w-sm">{copiedText}</span>
        </div>
      )}
    </div>
  );
}
