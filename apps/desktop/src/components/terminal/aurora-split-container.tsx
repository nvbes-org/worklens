import { AuroraPane } from './aurora-pane';
import type { TerminalLayoutMode, TerminalPaneConfig } from './types';

interface Props {
  panes: TerminalPaneConfig[];
  activePaneId: string;
  layout: TerminalLayoutMode;
  onFocusPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onSplitRight: (paneId: string) => void;
  onSplitDown: (paneId: string) => void;
  onToggleZoom: () => void;
  isZoomed: boolean;
}

export function AuroraSplitContainer({
  panes,
  activePaneId,
  layout,
  onFocusPane,
  onClosePane,
  onSplitRight,
  onSplitDown,
  onToggleZoom,
  isZoomed,
}: Props) {
  if (panes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
        No active panes. Press ⌘T for new terminal.
      </div>
    );
  }

  // Stack Mode (Zoom 100%)
  if (isZoomed || layout === 'stack') {
    const targetPane = panes.find((p) => p.id === activePaneId) || panes[0];
    return (
      <div className="flex-1 w-full h-full">
        <AuroraPane
          key={targetPane.id}
          pane={targetPane}
          isActive={true}
          onFocus={() => onFocusPane(targetPane.id)}
          onClose={() => onClosePane(targetPane.id)}
          onSplitRight={() => onSplitRight(targetPane.id)}
          onSplitDown={() => onSplitDown(targetPane.id)}
          onToggleZoom={onToggleZoom}
          isZoomed={true}
        />
      </div>
    );
  }

  // 1 Pane Only
  if (panes.length === 1) {
    const pane = panes[0];
    return (
      <div className="flex-1 w-full h-full">
        <AuroraPane
          key={pane.id}
          pane={pane}
          isActive={true}
          onFocus={() => onFocusPane(pane.id)}
          onSplitRight={() => onSplitRight(pane.id)}
          onSplitDown={() => onSplitDown(pane.id)}
          onToggleZoom={onToggleZoom}
          isZoomed={false}
        />
      </div>
    );
  }

  // Fat Layout: Primary top pane (70%), helper bottom row (30%)
  if (layout === 'fat') {
    const primary = panes[0];
    const secondaryPanes = panes.slice(1);

    return (
      <div className="flex-1 flex flex-col w-full h-full divide-y divide-white/10">
        <div className="h-[70%] w-full">
          <AuroraPane
            key={primary.id}
            pane={primary}
            isActive={primary.id === activePaneId}
            onFocus={() => onFocusPane(primary.id)}
            onClose={() => onClosePane(primary.id)}
            onSplitRight={() => onSplitRight(primary.id)}
            onSplitDown={() => onSplitDown(primary.id)}
            onToggleZoom={onToggleZoom}
          />
        </div>
        <div className="h-[30%] w-full flex divide-x divide-white/10">
          {secondaryPanes.map((p) => (
            <div key={p.id} className="flex-1 h-full">
              <AuroraPane
                pane={p}
                isActive={p.id === activePaneId}
                onFocus={() => onFocusPane(p.id)}
                onClose={() => onClosePane(p.id)}
                onSplitRight={() => onSplitRight(p.id)}
                onSplitDown={() => onSplitDown(p.id)}
                onToggleZoom={onToggleZoom}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Tall Layout: Primary left pane (70%), vertical side column (30%)
  if (layout === 'tall') {
    const primary = panes[0];
    const secondaryPanes = panes.slice(1);

    return (
      <div className="flex-1 flex w-full h-full divide-x divide-white/10">
        <div className="w-[70%] h-full">
          <AuroraPane
            key={primary.id}
            pane={primary}
            isActive={primary.id === activePaneId}
            onFocus={() => onFocusPane(primary.id)}
            onClose={() => onClosePane(primary.id)}
            onSplitRight={() => onSplitRight(primary.id)}
            onSplitDown={() => onSplitDown(primary.id)}
            onToggleZoom={onToggleZoom}
          />
        </div>
        <div className="w-[30%] h-full flex flex-col divide-y divide-white/10">
          {secondaryPanes.map((p) => (
            <div key={p.id} className="flex-1 w-full">
              <AuroraPane
                pane={p}
                isActive={p.id === activePaneId}
                onFocus={() => onFocusPane(p.id)}
                onClose={() => onClosePane(p.id)}
                onSplitRight={() => onSplitRight(p.id)}
                onSplitDown={() => onSplitDown(p.id)}
                onToggleZoom={onToggleZoom}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Grid Layout (Balanced 2x2 or equal splits)
  if (layout === 'grid') {
    const half = Math.ceil(panes.length / 2);
    const topRow = panes.slice(0, half);
    const bottomRow = panes.slice(half);

    return (
      <div className="flex-1 flex flex-col w-full h-full divide-y divide-white/10">
        <div className="flex-1 flex divide-x divide-white/10">
          {topRow.map((p) => (
            <div key={p.id} className="flex-1 h-full">
              <AuroraPane
                pane={p}
                isActive={p.id === activePaneId}
                onFocus={() => onFocusPane(p.id)}
                onClose={() => onClosePane(p.id)}
                onSplitRight={() => onSplitRight(p.id)}
                onSplitDown={() => onSplitDown(p.id)}
                onToggleZoom={onToggleZoom}
              />
            </div>
          ))}
        </div>
        {bottomRow.length > 0 && (
          <div className="flex-1 flex divide-x divide-white/10">
            {bottomRow.map((p) => (
              <div key={p.id} className="flex-1 h-full">
                <AuroraPane
                  pane={p}
                  isActive={p.id === activePaneId}
                  onFocus={() => onFocusPane(p.id)}
                  onClose={() => onClosePane(p.id)}
                  onSplitRight={() => onSplitRight(p.id)}
                  onSplitDown={() => onSplitDown(p.id)}
                  onToggleZoom={onToggleZoom}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Free Splits: side-by-side or stacked evenly
  return (
    <div className="flex-1 flex w-full h-full divide-x divide-white/10">
      {panes.map((p) => (
        <div key={p.id} className="flex-1 h-full">
          <AuroraPane
            pane={p}
            isActive={p.id === activePaneId}
            onFocus={() => onFocusPane(p.id)}
            onClose={() => onClosePane(p.id)}
            onSplitRight={() => onSplitRight(p.id)}
            onSplitDown={() => onSplitDown(p.id)}
            onToggleZoom={onToggleZoom}
          />
        </div>
      ))}
    </div>
  );
}
