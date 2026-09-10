import { useQueryClient } from '@tanstack/react-query';
import { Background, Controls, type Edge as FlowEdge, MiniMap, type Node, ReactFlow } from '@xyflow/react';
import { useEffect, useMemo, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { Document, Graph, Project } from '@worklens/contracts';
import ELK from 'elkjs/lib/elk-api.js';
import { List, Network, RefreshCw } from 'lucide-react';
import { Empty, ErrorNotice, Loading, PageTitle, Source } from '../components/common';
import { TaskGraph } from '../components/task-graph';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { openSource, query } from '../lib/api';
import { useData, useGraph, useSession } from '../lib/session';

export function ArchitecturePage() {
  const { repo } = useSession();
  const graph = useGraph();
  const documents = useData<Document[]>('documents');
  const client = useQueryClient();
  const [filter, setFilter] = useState('');
  const [ecosystem, setEcosystem] = useState('all');
  const [external, setExternal] = useState(false);
  const [mode, setMode] = useState('graph');
  const [selected, setSelected] = useState<Project | null>(null);
  const [layout, setLayout] = useState<Node[]>([]);
  const [error, setError] = useState('');
  const [relation, setRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<unknown>(null);
  const nodes = useMemo(
    () =>
      (graph.data?.nodes ?? []).filter(
        (n) =>
          (external || !n.external) &&
          (ecosystem === 'all' || n.ecosystem === ecosystem) &&
          (!filter || n.name.toLowerCase().includes(filter.toLowerCase())),
      ),
    [graph.data, external, ecosystem, filter],
  );
  const visible = useMemo(() => nodes.slice(0, 300), [nodes]);
  const edges = useMemo(
    () =>
      (graph.data?.edges ?? []).filter(
        (e) => visible.some((n) => n.id === e.source) && visible.some((n) => n.id === e.target),
      ),
    [graph.data, visible],
  );
  useEffect(() => {
    let active = true;
    const elk = new ELK({
      workerFactory: () => new Worker(new URL('../lib/elk.worker.ts', import.meta.url), { type: 'module' }),
    });
    void elk
      .layout({
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.spacing.nodeNode': '35',
          'elk.layered.spacing.nodeNodeBetweenLayers': '80',
        },
        children: visible.map((n) => ({ id: n.id, width: 210, height: 60 })),
        edges: edges.map((e, i) => ({ id: String(i), sources: [e.source], targets: [e.target] })),
      })
      .then((result) => {
        if (!active) return;
        setLayout(
          (result.children ?? []).map((n) => ({
            id: n.id,
            position: { x: n.x ?? 0, y: n.y ?? 0 },
            data: { label: visible.find((p) => p.id === n.id)?.name },
            style: {
              width: 210,
              borderRadius: 10,
              border: '1px solid #c5d9cb',
              padding: 16,
              fontSize: 12,
              background: '#ffffff',
            },
          })),
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
  const flowEdges: FlowEdge[] = edges.map((e, i) => ({
    id: String(i),
    source: e.source,
    target: e.target,
    label: e.kind === 'contains' ? 'same component' : undefined,
    style: { stroke: e.evidence === 'declared' ? '#b0b8b3' : '#5b9272' },
    data: e,
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
    <>
      <PageTitle
        title="Architecture"
        description="Explore projects, packages and crates. Every relation retains its source and meaning."
      >
        <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
          Refresh graph
        </Button>
      </PageTitle>
      <ErrorNotice error={graph.error || error} />
      {relation && <p className="mb-3 rounded-md border p-3 text-xs">{relation}</p>}
      {graph.isPending && <Loading />}
      <div className="mb-4 flex items-center gap-3">
        <Input
          aria-label="Filter components"
          className="max-w-xs"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a component…"
        />
        <select
          aria-label="Ecosystem"
          className="rounded-md border bg-white px-3 py-2 text-sm"
          value={ecosystem}
          onChange={(e) => setEcosystem(e.target.value)}
        >
          {['all', 'nx', 'pnpm', 'cargo', 'npm'].map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={external} onChange={(e) => setExternal(e.target.checked)} />
          External packages
        </label>
        <div className="ml-auto flex gap-1">
          <Button
            aria-label="Graph view"
            variant={mode === 'graph' ? 'secondary' : 'ghost'}
            onClick={() => setMode('graph')}
          >
            <Network className="size-4" />
          </Button>
          <Button
            aria-label="List view"
            variant={mode === 'list' ? 'secondary' : 'ghost'}
            onClick={() => setMode('list')}
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>
      {nodes.length > 300 && (
        <p className="mb-3 text-xs text-amber-800">
          Showing the first 300 of {nodes.length} matching components. Filter to explore a smaller graph.
        </p>
      )}
      {nodes.length === 0 && !graph.isPending ? (
        <Empty title="No matching components">
          Change the filters or inspect connector diagnostics below.
        </Empty>
      ) : mode === 'graph' ? (
        <div className="h-[520px] overflow-hidden rounded-xl border bg-[#f5f7f4]">
          <ReactFlow
            nodes={layout}
            edges={flowEdges}
            fitView
            nodesConnectable={false}
            deleteKeyCode={null}
            key={`${filter}:${ecosystem}:${external}:${layout.length}`}
            onNodeClick={(_, node) => setSelected(graph.data?.nodes.find((n) => n.id === node.id) ?? null)}
            onEdgeClick={(_, edge) => {
              const e = edges[Number(edge.id)];
              setRelation(`${e.kind} · ${e.evidence} · ${e.origin}`);
            }}
          >
            <Background color="#cbd5ce" gap={22} />
            <Controls />
            <MiniMap pannable zoomable nodeColor="#8db49b" />
          </ReactFlow>
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-white">
          {nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              className="flex w-full justify-between p-4 text-left text-sm hover:bg-muted/40"
              onClick={() => setSelected(n)}
            >
              <span>
                {n.name}
                <span className="ml-3 text-xs text-muted-foreground">{n.root}</span>
              </span>
              <Badge variant="outline">{n.ecosystem}</Badge>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <section className="mt-6 rounded-xl border bg-white p-5">
          <div className="flex justify-between">
            <h2 className="font-semibold">{selected.name}</h2>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{selected.manifest}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {documents.data
              ?.filter(
                (doc) =>
                  doc.path.substring(0, Math.max(0, doc.path.lastIndexOf('/'))) ===
                  selected.root.replace(/^\.$/, ''),
              )
              .map((doc) => (
                <Button
                  key={doc.path}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (repo)
                      void openSource(repo.path, doc.path, true).catch((error) => setError(String(error)));
                  }}
                >
                  Same-directory source: {doc.path}
                </Button>
              ))}
          </div>
          <p className="mt-3 text-sm">
            {selected.features.length
              ? `Features: ${selected.features.join(', ')}`
              : 'No resolved features reported.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.targets.map((t) => (
              <Button
                key={t}
                size="sm"
                variant="outline"
                disabled={selected.ecosystem !== 'nx' || !repo?.trusted}
                onClick={() => {
                  void query('tasks', repo?.path, { project: selected.name, target: t })
                    .then(setTasks)
                    .catch((e) => setError(String(e)));
                }}
              >
                {t}
              </Button>
            ))}
          </div>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dependants
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {graph.data?.edges
              .filter((e) => e.target === selected.id)
              .map((e, i) => (
                <Badge key={`${e.source}:${i}`} variant="secondary">
                  {graph.data?.nodes.find((n) => n.id === e.source)?.name ?? e.source}
                </Badge>
              ))}
          </div>
          {tasks !== null && (
            <div className="mt-4">
              <TaskGraph value={tasks} />
            </div>
          )}
        </section>
      )}
      <footer className="mt-5 space-y-2">
        {graph.data?.sources.map((s, i) => (
          <Source key={`${s.source}:${i}`} source={s} />
        ))}
      </footer>
    </>
  );
}
