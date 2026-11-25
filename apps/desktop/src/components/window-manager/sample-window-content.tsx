import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Cpu,
  EyeOff,
  HardDrive,
  Pin,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatByteSize } from './disk-storage';
import type { WindowInstance } from './types';
import { useWindowManager } from './window-context';

interface SampleWidgetData {
  counter?: number;
  text?: string;
  autoIncrement?: boolean;
}

export function SampleWindowContent({ instance }: { instance: WindowInstance }) {
  const { updateInstanceData, duplicateWindow, toggleAlwaysOnTop, toggleDock, freezeInstance, closeWindow } =
    useWindowManager();

  const data = (instance.data as SampleWidgetData) || {};
  const [localText, setLocalText] = useState(data.text ?? 'Notes et session de travail...');
  const [isRunning, setIsRunning] = useState(data.autoIncrement ?? true);

  // Background active timer: proves that background instance continues running!
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      updateInstanceData<SampleWidgetData>(instance.id, (prev) => ({
        ...prev,
        counter: (prev.counter ?? 0) + 1,
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, instance.id, updateInstanceData]);

  // Sync text edits to instance state
  const handleTextChange = (newText: string) => {
    setLocalText(newText);
    updateInstanceData<SampleWidgetData>(instance.id, (prev) => ({
      ...prev,
      text: newText,
    }));
  };

  const counterValue = data.counter ?? 0;
  const isDocked = instance.dockMode === 'docked';

  return (
    <div className="flex flex-col gap-3 h-full text-xs" data-testid={`sample-content-${instance.id}`}>
      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 border border-black/5 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Cpu className="size-3.5 text-emerald-500" />
            <span>Processus actif</span>
          </div>
          <span
            className="font-mono font-semibold text-zinc-900 dark:text-zinc-100"
            data-testid="counter-value"
          >
            {counterValue}s
          </span>
        </div>

        <div className="p-2 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/50 border border-black/5 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-zinc-500">
            <HardDrive className="size-3.5 text-blue-500" />
            <span>Taille disque</span>
          </div>
          <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
            {instance.diskMetadata ? formatByteSize(instance.diskMetadata.byteSize) : 'En RAM'}
          </span>
        </div>
      </div>

      {/* Interactive Editor (Preserved across disk freezes) */}
      <div className="flex flex-col gap-1 flex-1 min-h-[90px]">
        <label
          htmlFor={`editor-${instance.id}`}
          className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400"
        >
          Mémoire d'état de l'instance (persistance garantie lors du freeze disque):
        </label>
        <textarea
          id={`editor-${instance.id}`}
          data-testid="input-instance-text"
          value={localText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Saisissez des données à persister..."
          className="flex-1 w-full p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 resize-none font-mono text-[11px] outline-hidden focus:border-blue-500"
        />
      </div>

      {/* Control Strip */}
      <div className="flex items-center justify-between pt-1 border-t border-black/5 dark:border-white/5 flex-wrap gap-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsRunning((prev) => !prev)}
            className="px-2 py-1 rounded bg-zinc-200/60 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1"
          >
            {isRunning ? <RotateCcw className="size-3" /> : <Play className="size-3" />}
            <span>{isRunning ? 'Pause' : 'Reprendre'}</span>
          </button>

          <button
            type="button"
            data-testid="btn-inner-duplicate"
            onClick={() => duplicateWindow(instance.id)}
            className="px-2 py-1 rounded bg-zinc-200/60 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1"
            title="Dupliquer la fenêtre"
          >
            <Copy className="size-3" />
            <span>Dupliquer</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="btn-inner-toggle-pin"
            onClick={() => toggleAlwaysOnTop(instance.id)}
            className={`px-2 py-1 rounded font-medium flex items-center gap-1 ${
              instance.isAlwaysOnTop
                ? 'bg-amber-500 text-white'
                : 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
            }`}
          >
            <Pin className="size-3" />
            <span>{instance.isAlwaysOnTop ? '1er plan actif' : '1er plan'}</span>
          </button>

          <button
            type="button"
            data-testid="btn-inner-toggle-dock"
            onClick={() => toggleDock(instance.id)}
            className="px-2 py-1 rounded bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium flex items-center gap-1"
          >
            {isDocked ? <ArrowUpRight className="size-3" /> : <ArrowDownLeft className="size-3" />}
            <span>{isDocked ? 'Détacher' : 'Rattacher'}</span>
          </button>

          <button
            type="button"
            data-testid="btn-inner-freeze"
            onClick={() => void freezeInstance(instance.id)}
            className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1"
            title="Sauvegarder sur disque et libérer la RAM"
          >
            <HardDrive className="size-3" />
            <span>Figer sur disque</span>
          </button>

          <button
            type="button"
            data-testid="btn-inner-hide"
            onClick={() => void closeWindow(instance.id, 'keep_active')}
            className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium flex items-center gap-1"
            title="Masquer mais garder actif en arrière-plan"
          >
            <EyeOff className="size-3" />
            <span>Arrière-plan</span>
          </button>
        </div>
      </div>
    </div>
  );
}
