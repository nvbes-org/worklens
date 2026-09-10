import { Background, Controls, type Node, ReactFlow } from '@xyflow/react';
import ELK from 'elkjs/lib/elk-api.js';
import { useEffect, useState } from 'react';
import '@xyflow/react/dist/style.css';
import { ErrorNotice } from './common';

export type RelationNode = { id: string; label: string };
export type RelationEdge = { id: string; source: string; target: string };

/** Layout belongs to ELK's dedicated worker; React only receives positioned nodes. */
export function RelationGraph({
  nodes,
  edges,
  onSelect,
}: {
  nodes: RelationNode[];
  edges: RelationEdge[];
  onSelect?: (id: string) => void;
}) {
  const [layout, setLayout] = useState<Node[]>([]);
  const [error, setError] = useState('');
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
          'elk.direction': 'DOWN',
          'elk.layered.spacing.nodeNodeBetweenLayers': '45',
        },
        children: nodes.map((node) => ({ id: node.id, width: 240, height: 60 })),
        edges: edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
      })
      .then((graph) => {
        if (active)
          setLayout(
            (graph.children ?? []).map((node) => ({
              id: node.id,
              position: { x: node.x ?? 0, y: node.y ?? 0 },
              data: { label: nodes.find((item) => item.id === node.id)?.label ?? node.id },
              style: { width: 240, height: 60, borderRadius: 8, fontSize: 11 },
            })),
          );
      })
      .catch((failure: unknown) => {
        if (active) setError(String(failure));
      });
    return () => {
      active = false;
      elk.terminateWorker();
    };
  }, [nodes, edges]);
  return (
    <>
      <ErrorNotice error={error} />
      <div className="h-96 overflow-hidden rounded-xl border bg-muted/30">
        <ReactFlow
          key={layout.length}
          nodes={layout}
          edges={edges}
          fitView
          nodesConnectable={false}
          deleteKeyCode={null}
          onNodeClick={(_, node) => onSelect?.(node.id)}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </>
  );
}
