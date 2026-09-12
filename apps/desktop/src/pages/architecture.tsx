import { useQueryClient } from '@tanstack/react-query';
import type { Graph } from '@worklens/contracts';
import { Background, Controls, type Edge as FlowEdge, MarkerType, type Node, ReactFlow } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import ELK from 'elkjs/lib/elk-api.js';
import { List, Network, RefreshCw } from 'lucide-react';
import { Empty, ErrorNotice, Loading, Source } from '../components/common';
import { ComponentInspector } from '../components/component-inspector';
import { NxTrustNotice } from '../components/nx-trust-notice';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ViewHeading } from '../components/view-heading';
import { query } from '../lib/api';
import { componentCategories, componentCategory } from '../lib/component-category';
import { componentGraph, ecosystems } from '../lib/component-graph';
import { useGraph, useSession } from '../lib/session';

export function ArchitecturePage() {
  const { repo } = useSession();
  const graph = useGraph();
  const merged = useMemo(() => componentGraph(graph.data), [graph.data]);
  const client = useQueryClient();
  const [filter, setFilter] = useState('');
  const [ecosystem, setEcosystem] = useState('all');
  const [external, setExternal] = useState(false);
  const [mode, setMode] = useState('graph');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<Node[]>([]);
  const [error, setError] = useState('');
  const [relation, setRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const nodes = useMemo(
    () =>
      merged.nodes.filter(
        (node) =>
          (external || !node.external) &&
          (ecosystem === 'all' || ecosystems(node).includes(ecosystem)) &&
          (!filter ||
            node.members.some((member) =>
              `${member.name} ${member.root}`.toLowerCase().includes(filter.toLowerCase()),
            )),
      ),
    [merged, external, ecosystem, filter],
  );
  const visible = useMemo(() => nodes.slice(0, 300), [nodes]);
  const edges = useMemo(() => {
    const ids = new Set(visible.map((node) => node.id));
    return merged.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  }, [merged, visible]);
  const selected = merged.nodes.find((node) => node.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    setError('');
    const elk = new ELK({
      workerFactory: () => new Worker(new URL('../lib/elk.worker.ts', import.meta.url), { type: 'module' }),
    });
    void elk
      .layout({
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.spacing.nodeNode': '40',
          'elk.layered.spacing.nodeNodeBetweenLayers': '100',
        },
        children: visible.map((node) => ({ id: node.id, width: 218, height: 76 })),
        edges: edges.map((edge, i) => ({ id: String(i), sources: [edge.source], targets: [edge.target] })),
      })
      .then((result) => {
        if (!active) return;
        setLayout(
          (result.children ?? []).map((node) => {
            const project = visible.find((item) => item.id === node.id);
            return {
              id: node.id,
              className: `component-${project ? componentCategory(project) : 'module'}`,
              ariaLabel: `${project?.name ?? node.id} module`,
              ariaRole: 'button',
              focusable: true,
              position: { x: node.x ?? 0, y: node.y ?? 0 },
              data: {
                label: (
                  <div className="graph-node-label">
                    <span>{project?.name}</span>
                    <small>{project?.root || 'External package'}</small>
                    <em>{project ? ecosystems(project).join(' · ') : ''}</em>
                  </div>
                ),
              },
              sourcePosition: 'right' as Node['sourcePosition'],
              targetPosition: 'left' as Node['targetPosition'],
              style: { width: 218, height: 76 },
            };
          }),
        );
      })
      .catch((error: unknown) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
      elk.terminateWorker();
    };
  }, [visible, edges]);

  const flowEdges: FlowEdge[] = edges.map((edge, i) => ({
    id: String(i),
    source: edge.source,
    target: edge.target,
    label: edge.kind === 'contains' ? 'same component' : undefined,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#a1a1aa' },
    style: { stroke: edge.evidence === 'declared' ? '#a1a1aa' : '#007aff', strokeWidth: 1.5 },
  }));
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      const data = await query<Graph>('graph', repo?.path, { refresh: true });
      client.setQueryData(['graph', repo?.path, {}], data);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="architecture-page">
      <ViewHeading
        section="Architecture"
        title="Understand your monorepo"
        description="Explore your modules and the dependencies that connect them."
      >
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void refresh()}>
          <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />
          Refresh graph
        </Button>
      </ViewHeading>
      <ErrorNotice error={graph.error || error} />
      <NxTrustNotice graph={graph.data} />
      <div className="architecture-controls">
        <fieldset className="view-segment" aria-label="Architecture view">
          <Button
            size="sm"
            variant={mode === 'graph' ? 'secondary' : 'ghost'}
            aria-label="Graph view"
            aria-pressed={mode === 'graph'}
            onClick={() => setMode('graph')}
          >
            <Network className="size-3.5" />
            Graph
          </Button>
          <Button
            size="sm"
            variant={mode === 'list' ? 'secondary' : 'ghost'}
            aria-label="List view"
            aria-pressed={mode === 'list'}
            onClick={() => setMode('list')}
          >
            <List className="size-3.5" />
            List
          </Button>
        </fieldset>
        <Input
          aria-label="Filter components"
          className="h-8 max-w-[240px] text-xs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a module…"
        />
        <select
          aria-label="Ecosystem"
          className="h-8 rounded-md border bg-white px-2 text-xs"
          value={ecosystem}
          onChange={(e) => setEcosystem(e.target.value)}
        >
          {['all', ...new Set((graph.data?.nodes ?? []).map((node) => node.ecosystem))].map((value) => (
            <option key={value} value={value}>
              {value === 'all' ? 'All types' : value}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={external} onChange={(e) => setExternal(e.target.checked)} />
          External
        </label>
        <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
          {nodes.length} modules · {edges.length} links
        </span>
      </div>
      {nodes.length > 300 && (
        <p className="mb-3 text-xs text-amber-800">
          Showing 300 of {nodes.length} modules. Narrow your filters to see more.
        </p>
      )}
      {relation && (
        <p role="status" className="mb-3 whitespace-pre-line rounded-md border p-3 text-xs">
          {relation}
        </p>
      )}
      <div className="architecture-workspace" data-inspecting={Boolean(selected)}>
        <div className="architecture-canvas">
          {graph.isPending ? (
            <div className="p-5">
              <Loading />
            </div>
          ) : nodes.length === 0 ? (
            <div className="p-5">
              <Empty title="No matching components">
                Change the filters or inspect connector diagnostics below.
              </Empty>
            </div>
          ) : mode === 'graph' ? (
            <ReactFlow
              nodes={layout.map((node) => ({ ...node, selected: node.id === selectedId }))}
              edges={flowEdges}
              fitView
              fitViewOptions={{ padding: 0.22 }}
              nodesConnectable={false}
              nodesDraggable={false}
              deleteKeyCode={null}
              minZoom={0.05}
              maxZoom={1.8}
              key={`${filter}:${ecosystem}:${external}:${layout.map((node) => node.id).join(',')}`}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
              onKeyDown={(event) => {
                if (!(event.target instanceof Element)) return;
                const id = event.target.closest<HTMLElement>('.react-flow__node')?.dataset.id;
                if (!id) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedId(id);
                } else if (event.key === 'Escape') setSelectedId(null);
              }}
              onEdgeClick={(_, edge) => {
                const selectedEdge = edges[Number(edge.id)];
                if (selectedEdge) setRelation(selectedEdge.origin);
              }}
            >
              <Background color="#dedee5" gap={20} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : (
            <div className="divide-y">
              {nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  className={`flex w-full items-center justify-between gap-3 p-4 text-left text-sm ${node.id === selectedId ? 'bg-accent' : 'hover:bg-white'}`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{node.name}</span>
                    <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
                      {node.root}
                    </span>
                  </span>
                  <Badge variant="outline">{ecosystems(node).join(' · ')}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && <ComponentInspector selected={selected} graph={merged} onSelect={setSelectedId} />}
      </div>
      <fieldset className="architecture-legend" aria-label="Component categories">
        {Object.entries(componentCategories).map(([category, label]) => (
          <span key={category}>
            <i className={`component-${category}`} />
            {label}
          </span>
        ))}
        <span className="ml-auto">Module → dependency</span>
      </fieldset>
      <details className="architecture-sources">
        <summary>Collection sources</summary>
        {graph.data?.sources.map((source, i) => (
          <Source key={`${source.source}:${i}`} source={source} />
        ))}
      </details>
    </section>
  );
}
