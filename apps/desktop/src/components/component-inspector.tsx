import { Link } from '@tanstack/react-router';
import type { Document, Graph } from '@worklens/contracts';
import { ArrowRight, Box } from 'lucide-react';
import { useState } from 'react';
import { openSource, query } from '../lib/api';
import { type ComponentProject, ecosystems } from '../lib/component-graph';
import { useData, useSession } from '../lib/session';
import { ErrorNotice } from './common';
import { ComponentMetadata } from './component-metadata';
import { TaskGraph } from './task-graph';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export function ComponentInspector({
  selected,
  graph,
  onSelect,
}: {
  selected: ComponentProject | null;
  graph?: Graph;
  onSelect: (id: string | null) => void;
}) {
  // Reset task results and errors when another module is selected.
  return <InspectorDetails key={selected?.id} selected={selected} graph={graph} onSelect={onSelect} />;
}
function InspectorDetails({
  selected,
  graph,
  onSelect,
}: {
  selected: ComponentProject | null;
  graph?: Graph;
  onSelect: (id: string | null) => void;
}) {
  const { repo } = useSession();
  const documents = useData<Document[]>('documents');
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState<unknown>(null);
  return (
    <aside className="component-inspector" aria-label="Component inspector">
      {!selected ? (
        <div className="inspector-empty">
          <Box className="mb-4 size-7" />
          <h2 className="font-medium text-foreground">Explore a module</h2>
          <p className="mt-2 text-xs leading-5">
            Select a module to see its dependencies, source and available targets.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-center justify-between">
            <span className="rounded-lg bg-blue-50 p-2 text-primary">
              <Box className="size-5" />
            </span>
            <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
              Close
            </Button>
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{selected.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.external ? 'External dependency / vendor' : 'Workspace package'}
          </p>
          {selected.members.map((member) => (
            <div key={member.id} className="mt-2">
              {selected.members.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  {member.ecosystem} · {member.name}
                </p>
              )}
              <p className="break-all font-mono text-[11px] text-muted-foreground">{member.manifest}</p>
            </div>
          ))}
          <div className="mt-4 flex gap-2">
            {ecosystems(selected).map((ecosystem) => (
              <Badge key={ecosystem} variant="secondary">
                {ecosystem}
              </Badge>
            ))}
            <Badge variant="outline">{selected.kind}</Badge>
          </div>
          <ErrorNotice error={error} />
          <ComponentMetadata key={selected.id} project={selected} />
          {selected.features.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">Features: {selected.features.join(', ')}</p>
          )}
          {[
            { title: 'Dependencies', outgoing: true },
            { title: 'Used by', outgoing: false },
          ].map((section) => {
            const ids = new Set(
              graph?.edges
                .filter(
                  (edge) =>
                    edge.kind !== 'contains' &&
                    (section.outgoing ? edge.source : edge.target) === selected.id,
                )
                .map((edge) => (section.outgoing ? edge.target : edge.source)),
            );
            return (
              <section key={section.title} className="mt-7">
                <h3 className="mb-3 flex justify-between text-xs font-medium">
                  {section.title}
                  <span className="text-muted-foreground">{ids.size}</span>
                </h3>
                {ids.size === 0 ? (
                  <p className="text-xs text-muted-foreground">None reported</p>
                ) : (
                  [...ids].map((id) => (
                    <button
                      type="button"
                      key={id}
                      className="inspector-relation"
                      onClick={() => onSelect(id)}
                    >
                      <Box className="size-3.5" />
                      <span className="flex-1 truncate">
                        {graph?.nodes.find((node) => node.id === id)?.name ?? id}
                      </span>
                      <ArrowRight className="size-3" />
                    </button>
                  ))
                )}
              </section>
            );
          })}
          {selected.members.some((member) => member.targets.length > 0) && (
            <details className="mt-7">
              <summary className="cursor-pointer text-xs font-medium">Available targets</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.members.flatMap((member) =>
                  member.targets.map((target) => (
                    <Button
                      key={`${member.id}:${target}`}
                      size="sm"
                      variant="outline"
                      disabled={member.ecosystem !== 'nx' || !repo?.trusted}
                      onClick={() =>
                        void query('tasks', repo?.path, { project: member.name, target })
                          .then(setTasks)
                          .catch((e) => setError(String(e)))
                      }
                    >
                      {selected.members.length > 1 ? `${member.ecosystem} · ${target}` : target}
                    </Button>
                  )),
                )}
                <p className="text-[10px] text-muted-foreground">
                  Inspect the task graph. Requires repository trust.
                </p>
              </div>
            </details>
          )}
          {documents.data
            ?.filter(
              (doc) =>
                doc.path.substring(0, Math.max(0, doc.path.lastIndexOf('/'))) ===
                selected.root.replace(/^\.$/, ''),
            )
            .map((doc) => (
              <Button
                key={doc.path}
                size="sm"
                variant="ghost"
                className="mt-3 max-w-full truncate"
                onClick={() => {
                  if (repo) void openSource(repo.path, doc.path, true).catch((e) => setError(String(e)));
                }}
              >
                Source: {doc.path}
              </Button>
            ))}
          {tasks !== null && (
            <div className="mt-4">
              <TaskGraph value={tasks} />
            </div>
          )}
          <Link
            to="/$view"
            params={{ view: 'git' }}
            className="mt-8 flex items-center gap-2 text-xs text-primary"
          >
            View project changes
            <ArrowRight className="size-3" />
          </Link>
        </>
      )}
    </aside>
  );
}
