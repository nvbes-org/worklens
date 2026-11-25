import { useMemo } from 'react';
import { record } from '../lib/api';
import { RelationGraph } from './relation-graph';

export function TaskGraph({ value }: { value: unknown }) {
  const graph = useMemo(() => {
    const data = record(value);
    const tasks = record(data.taskGraph ?? data);
    const ids = Object.keys(record(tasks.tasks)).slice(0, 300);
    const dependencies = record(tasks.dependencies);
    return {
      nodes: ids.map((id) => ({ id, label: id })),
      edges: ids.flatMap((id) => {
        const targets = dependencies[id];
        return (Array.isArray(targets) ? targets : [])
          .filter((target): target is string => typeof target === 'string' && ids.includes(target))
          .map((target) => ({ id: `${id}:${target}`, source: id, target }));
      }),
    };
  }, [value]);
  return (
    <section className="mt-4 space-y-3">
      <h3 className="text-sm font-medium">Task dependencies</h3>
      <p className="text-xs text-muted-foreground">
        Local Nx task graph, up to 300 tasks. Tasks are not executed.
      </p>
      {graph.nodes.length ? (
        <RelationGraph {...graph} />
      ) : (
        <p className="text-sm">No structured task graph returned by this Nx version.</p>
      )}
    </section>
  );
}
