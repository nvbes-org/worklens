import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSeek?: (percentage: number) => void;
}

export function AuroraReplayBar({ isOpen, onClose, onSeek }: Props) {
  const [position, setPosition] = useState(100);
  const [_isPlaying, setIsPlaying] = useState(false);

  if (!isOpen) return null;

  const isLive = position >= 100;

  function handleChange(val: number) {
    setPosition(val);
    onSeek?.(val);
  }

  function handleStepBack() {
    const next = Math.max(0, position - 5);
    handleChange(next);
  }

  function handleStepForward() {
    const next = Math.min(100, position + 5);
    handleChange(next);
  }

  function handleGoLive() {
    handleChange(100);
    setIsPlaying(false);
  }

  // Calculate simulated relative time
  const secondsAgo = Math.round(((100 - position) / 100) * 600); // up to 10 mins ago
  const minutes = Math.floor(secondsAgo / 60);
  const seconds = secondsAgo % 60;
  const timeFormatted =
    secondsAgo === 0 ? 'LIVE' : `-${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="h-10 px-3 border-t border-cyan-500/30 bg-[#090d16]/95 backdrop-blur-md flex items-center justify-between text-xs text-slate-300 z-30 select-none">
      {/* Mode Badge */}
      <div className="flex items-center gap-2">
        <span
          className={`size-2 rounded-full ${
            isLive ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-cyan-400 animate-pulse'
          }`}
        />
        <span className="font-semibold text-slate-200">{isLive ? 'Live Buffer' : 'Instant Replay'}</span>
        <span className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px] text-cyan-300">
          {timeFormatted}
        </span>
      </div>

      {/* Scrubbing Slider & Controls */}
      <div className="flex items-center gap-3 flex-1 max-w-lg mx-6">
        <button
          type="button"
          onClick={handleStepBack}
          className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-slate-200"
          title="Step Backward (5s)"
        >
          <ChevronLeft className="size-4" />
        </button>

        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => handleChange(Number(e.target.value))}
          className="flex-1 accent-cyan-400 cursor-pointer h-1.5 bg-white/20 rounded-lg"
        />

        <button
          type="button"
          onClick={handleStepForward}
          className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-slate-200"
          title="Step Forward (5s)"
        >
          <ChevronRight className="size-4" />
        </button>

        {!isLive && (
          <button
            type="button"
            onClick={handleGoLive}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 text-[11px] font-medium"
          >
            <RotateCcw className="size-3" />
            <span>Go Live</span>
          </button>
        )}
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-rose-400 transition-colors"
        title="Exit Replay (Esc / ⌘⌥R)"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
