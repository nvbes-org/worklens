import type { Branch, Commit, Tag } from '@worklens/contracts';
import { Copy, GitBranch, GitMerge, Tag as TagIcon } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import { BranchDragDropModal, type DragDropPair } from './branch-drag-drop-modal';
import { computeGraphLayout, getInitials, stringToColor } from './git-graph-layout';

const ROW_HEIGHT = 44;
const LANE_WIDTH = 18;
const SVG_PADDING_LEFT = 14;

interface Props {
  commits: Commit[];
  headSha: string | null;
  currentBranch: string | null;
  branches: Branch[];
  tags: Tag[];
  selectedSha: string | null;
  onSelectCommit: (commit: Commit) => void;
  onActionSuccess?: (message: string) => void;
}

export function GitGraph({
  commits,
  headSha,
  currentBranch,
  branches,
  tags,
  selectedSha,
  onSelectCommit,
  onActionSuccess,
}: Props) {
  const [draggedBranch, setDraggedBranch] = useState<string | null>(null);
  const [dragDropPair, setDragDropPair] = useState<DragDropPair | null>(null);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  const { nodes, maxLanes } = useMemo(() => {
    return computeGraphLayout(commits, headSha, branches, tags);
  }, [commits, headSha, branches, tags]);

  const svgWidth = SVG_PADDING_LEFT + maxLanes * LANE_WIDTH + 8;
  const svgHeight = commits.length * ROW_HEIGHT;

  function copySha(sha: string, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 2000);
  }

  function handleDragStart(branchName: string, e: React.DragEvent) {
    e.stopPropagation();
    setDraggedBranch(branchName);
    e.dataTransfer.setData('text/plain', branchName);
    e.dataTransfer.effectAllowed = 'copyMove';
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(targetBranch: string, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (draggedBranch && draggedBranch !== targetBranch) {
      setDragDropPair({ source: draggedBranch, target: targetBranch });
    }
    setDraggedBranch(null);
  }

  return (
    <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden border rounded-xl bg-card">
      <BranchDragDropModal
        pair={dragDropPair}
        onClose={() => setDragDropPair(null)}
        onSuccess={(msg) => onActionSuccess?.(msg)}
      />

      <div className="flex-1 overflow-auto">
        <div className="relative flex min-w-[700px]">
          {/* SVG Canvas for Lanes & Connectors */}
          <div className="shrink-0 relative select-none" style={{ width: svgWidth, height: svgHeight }}>
            <svg
              className="absolute inset-0 pointer-events-none"
              width={svgWidth}
              height={svgHeight}
              style={{ overflow: 'visible' }}
              aria-label="Git commit graph"
              role="img"
            >
              <title>Git commit graph</title>
              {/* Connector lines */}
              {nodes.flatMap((node) =>
                node.routes.map((route, i) => {
                  const x1 = SVG_PADDING_LEFT + route.fromLane * LANE_WIDTH;
                  const y1 = route.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const x2 = SVG_PADDING_LEFT + route.toLane * LANE_WIDTH;
                  const y2 = route.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

                  let pathD = '';
                  if (x1 === x2) {
                    pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
                  } else {
                    const midY = (y1 + y2) / 2;
                    pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
                  }

                  return (
                    <path
                      key={`${node.commit.sha}-${route.toRow}-${i}`}
                      d={pathD}
                      fill="none"
                      stroke={route.color}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  );
                }),
              )}

              {/* Commit Nodes */}
              {nodes.map((node) => {
                const cx = SVG_PADDING_LEFT + node.lane * LANE_WIDTH;
                const cy = node.rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
                const isSelected = selectedSha === node.commit.sha;

                return (
                  <g key={node.commit.sha} className="transition-transform duration-100">
                    {/* Head or Selected Ring */}
                    {(node.isHead || isSelected) && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={node.isHead ? 8 : 7}
                        fill="none"
                        stroke={node.isHead ? '#10b981' : node.color}
                        strokeWidth="2"
                        strokeDasharray={node.isHead ? '3 2' : 'none'}
                        className={node.isHead ? 'animate-spin-slow' : ''}
                      />
                    )}

                    {/* Node Dot */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={node.isMerge ? 5.5 : 4.5}
                      fill={node.isMerge ? 'var(--background)' : node.color}
                      stroke={node.color}
                      strokeWidth={node.isMerge ? '2.5' : '1.5'}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Commit Rows */}
          <div className="flex-1 divide-y divide-border/40 min-w-0">
            {nodes.map((node) => {
              const { commit, isHead, isMerge, branches: nodeBranches, tags: nodeTags } = node;
              const isSelected = selectedSha === commit.sha;
              const authorColor = stringToColor(commit.author || 'User');
              const initials = getInitials(commit.author || 'User');

              return (
                <div
                  key={commit.sha}
                  className={`group flex items-center gap-3 px-3 text-xs transition-colors ${
                    isSelected ? 'bg-accent/80 font-medium' : 'hover:bg-muted/40'
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectCommit(commit)}
                    aria-pressed={isSelected}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer h-full"
                  >
                    {/* Author Avatar */}
                    <div
                      className="size-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 select-none shadow-2xs"
                      style={{ backgroundColor: authorColor }}
                      title={`${commit.author} <${commit.authorEmail}>`}
                    >
                      {initials}
                    </div>

                    {/* Badges: HEAD, Branches, Tags */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap max-w-[280px]">
                      {isHead && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          HEAD
                        </span>
                      )}

                      {nodeBranches.map((b) => {
                        const isCurrent = b.name === currentBranch;
                        const isRemote = b.name.includes('/');
                        return (
                          <button
                            type="button"
                            key={b.name}
                            draggable
                            onDragStart={(e) => handleDragStart(b.name, e)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(b.name, e)}
                            title={`Branch: ${b.name} (drag onto another branch to merge/rebase)`}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono cursor-grab active:cursor-grabbing select-none border transition-all ${
                              isCurrent
                                ? 'bg-primary text-primary-foreground border-primary font-semibold'
                                : isRemote
                                  ? 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                            }`}
                          >
                            <GitBranch className="size-2.5 shrink-0" />
                            <span className="truncate max-w-[120px]">{b.name}</span>
                          </button>
                        );
                      })}

                      {nodeTags.map((t) => (
                        <span
                          key={t.name}
                          title={`Tag: ${t.name}`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0"
                        >
                          <TagIcon className="size-2.5" />
                          <span className="truncate max-w-[90px]">{t.name}</span>
                        </span>
                      ))}
                    </div>

                    {/* Subject / Message */}
                    <div className="min-w-0 flex-1 truncate text-foreground flex items-center gap-2">
                      {isMerge && <GitMerge className="size-3 text-muted-foreground shrink-0" />}
                      <span className="truncate" title={commit.subject}>
                        {commit.subject}
                      </span>
                    </div>

                    {/* Author Name */}
                    <div
                      className="w-28 truncate text-[11px] text-muted-foreground text-right shrink-0 hidden md:block"
                      title={commit.author}
                    >
                      {commit.author}
                    </div>

                    {/* Date */}
                    <div className="w-24 text-[10px] text-muted-foreground text-right shrink-0">
                      {new Date(commit.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </button>

                  {/* SHA Badge */}
                  <button
                    type="button"
                    onClick={(e) => copySha(commit.sha, e)}
                    className="font-mono text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded border border-transparent hover:border-border hover:bg-muted/60 shrink-0"
                    title="Click to copy SHA"
                  >
                    <span>{copiedSha === commit.sha ? 'Copied!' : commit.sha.slice(0, 7)}</span>
                    <Copy className="size-2.5 opacity-60 group-hover:opacity-100" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
