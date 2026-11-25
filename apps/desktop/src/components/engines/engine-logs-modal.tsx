import { Copy, Terminal, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';

interface EngineLogsModalProps {
  title: string;
  logs: string;
  isOpen: boolean;
  onClose: () => void;
}

export function EngineLogsModal({ title, logs, isOpen, onClose }: EngineLogsModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    void navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-400" />
            <h3 className="font-semibold text-sm text-zinc-100">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-8 gap-1.5 border-zinc-700 bg-zinc-800/80 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Copy logs'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-black/40 p-4 font-mono text-xs text-zinc-300">
          {logs.trim() ? (
            <pre className="whitespace-pre-wrap select-text leading-relaxed">{logs}</pre>
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500">
              No log output available for this instance.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
