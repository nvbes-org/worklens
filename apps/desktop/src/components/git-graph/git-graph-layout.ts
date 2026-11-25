import type { Branch, Commit, Tag } from '@worklens/contracts';

export const LANE_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#a855f7', // violet
  '#14b8a6', // teal
  '#6366f1', // indigo
];

export interface GraphNode {
  commit: Commit;
  rowIndex: number;
  lane: number;
  color: string;
  isMerge: boolean;
  isHead: boolean;
  branches: Branch[];
  tags: Tag[];
  routes: GraphRoute[];
}

export interface GraphRoute {
  fromLane: number;
  toLane: number;
  fromRow: number;
  toRow: number;
  color: string;
}

export function computeGraphLayout(
  commits: Commit[],
  headSha: string | null,
  branches: Branch[],
  tags: Tag[],
): { nodes: GraphNode[]; maxLanes: number } {
  const commitIndices = new Map<string, number>();
  for (let idx = 0; idx < commits.length; idx++) {
    commitIndices.set(commits[idx].sha, idx);
  }

  const branchMap = new Map<string, Branch[]>();
  for (const b of branches) {
    const list = branchMap.get(b.head) ?? [];
    list.push(b);
    branchMap.set(b.head, list);
  }

  const tagMap = new Map<string, Tag[]>();
  for (const t of tags) {
    const list = tagMap.get(t.commit) ?? [];
    list.push(t);
    tagMap.set(t.commit, list);
  }

  const activeLanes: (string | null)[] = [];
  const nodes: GraphNode[] = [];
  let maxLanes = 1;

  for (let rowIndex = 0; rowIndex < commits.length; rowIndex++) {
    const commit = commits[rowIndex];
    let lane = activeLanes.indexOf(commit.sha);

    if (lane === -1) {
      lane = activeLanes.indexOf(null);
      if (lane === -1) {
        lane = activeLanes.length;
        activeLanes.push(null);
      }
    }

    activeLanes[lane] = null;
    const color = LANE_COLORS[lane % LANE_COLORS.length];
    const routes: GraphRoute[] = [];

    // Route to parents
    commit.parents.forEach((parentSha, parentIdx) => {
      const parentRow = commitIndices.get(parentSha);
      if (parentRow === undefined) return;

      let parentLane = activeLanes.indexOf(parentSha);
      if (parentLane === -1) {
        if (parentIdx === 0 && activeLanes[lane] === null) {
          parentLane = lane;
          activeLanes[lane] = parentSha;
        } else {
          parentLane = activeLanes.indexOf(null);
          if (parentLane === -1) {
            parentLane = activeLanes.length;
            activeLanes.push(parentSha);
          } else {
            activeLanes[parentLane] = parentSha;
          }
        }
      }

      routes.push({
        fromLane: lane,
        toLane: parentLane,
        fromRow: rowIndex,
        toRow: parentRow,
        color: LANE_COLORS[parentLane % LANE_COLORS.length],
      });
    });

    maxLanes = Math.max(maxLanes, activeLanes.length, lane + 1);

    nodes.push({
      commit,
      rowIndex,
      lane,
      color,
      isMerge: commit.parents.length > 1,
      isHead: commit.sha === headSha,
      branches: branchMap.get(commit.sha) ?? [],
      tags: tagMap.get(commit.sha) ?? [],
      routes,
    });
  }

  return { nodes, maxLanes: Math.max(1, maxLanes) };
}

export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 45%)`;
}

export function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
