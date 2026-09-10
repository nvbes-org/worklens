import { Link } from '@tanstack/react-router';
import { ArrowRight, Bot, GitBranch, Layers } from 'lucide-react';
import { Empty, ErrorNotice, PageTitle, Source } from '../components/common';
import { DeliverySummary } from '../components/delivery-summary';
import { Badge } from '../components/ui/badge';
import { useAgents, useGit, useGraph, useSession } from '../lib/session';

export function Overview() {
  const { repo } = useSession();
  const git = useGit();
  const graph = useGraph();
  const agents = useAgents();
  const active = agents.data?.filter((a) => !['completed', 'failed'].includes(a.state)) ?? [];
  const metrics = [
    {
      title: 'Worktrees',
      value: git.data?.worktrees.length,
      icon: GitBranch,
      detail: 'Parallel working directories',
      view: 'git',
    },
    {
      title: 'Local components',
      value: graph.data?.nodes.filter((n) => !n.external).length,
      icon: Layers,
      detail: 'Projects, packages and crates',
      view: 'architecture',
    },
    {
      title: 'Declared tasks',
      value: active.length,
      icon: Bot,
      detail: `${active.filter((a) => a.presence === 'recent').length} with recent presence`,
      view: 'agents',
    },
  ];
  return (
    <>
      <PageTitle
        title="Workspace overview"
        description={`A connected view of ${repo?.name}. Local facts first, delivery signals alongside.`}
      />
      <div className="mb-8 grid grid-cols-3 overflow-hidden rounded-xl border bg-white">
        {metrics.map((m) => (
          <Link
            key={m.title}
            to="/$view"
            params={{ view: m.view }}
            className="border-r p-6 last:border-r-0 hover:bg-muted/40"
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {m.title}
              <m.icon className="size-4" />
            </div>
            <div className="my-3 text-4xl font-medium tracking-tight">{m.value ?? '—'}</div>
            <p className="text-xs text-muted-foreground">{m.detail}</p>
          </Link>
        ))}
      </div>
      <ErrorNotice error={git.error} />
      <ErrorNotice error={graph.error} />
      <ErrorNotice error={agents.error} />
      <div className="grid grid-cols-[1.2fr_1fr] gap-8">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Work in progress</h2>
            <Link
              to="/$view"
              params={{ view: 'git' }}
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              Explore Git
              <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="divide-y rounded-xl border bg-white">
            {git.data?.worktrees.map((tree) => (
              <div key={tree.id} className="p-4">
                <div className="flex items-center gap-2">
                  <GitBranch className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{tree.branch ?? 'Detached HEAD'}</span>
                  {tree.path === repo?.path && <Badge variant="secondary">current</Badge>}
                </div>
                <p className="mt-2 truncate pl-6 font-mono text-xs text-muted-foreground">{tree.path}</p>
              </div>
            ))}
          </div>
          {git.data && (
            <div className="mt-4">
              <Source source={git.data.provenance} />
            </div>
          )}
        </section>
        <section>
          <h2 className="mb-4 font-semibold">Agent activity</h2>
          {active.length === 0 ? (
            <Empty title="No declared activity">
              Agents appear when they report through Worklens CLI or MCP. Process detection is not used to
              infer task progress.
            </Empty>
          ) : (
            <div className="divide-y rounded-xl border bg-white">
              {active.map((agent) => (
                <div key={agent.id} className="p-4">
                  <div className="flex justify-between">
                    <span className="font-medium text-sm">{agent.tool}</span>
                    <Badge variant="outline">{agent.state}</Badge>
                  </div>
                  <p className="mt-2 text-sm">{agent.objective}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Presence: {agent.presence}</p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-6 rounded-xl border bg-primary/5 p-5">
            <h3 className="text-sm font-medium">Follow a change through delivery</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Connect GitHub to trace pull requests to their exact checks, changed projects and local
              worktrees.
            </p>
            <Link
              to="/$view"
              params={{ view: 'pull-requests' }}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium"
            >
              Explore pull requests
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </div>
      <DeliverySummary />
    </>
  );
}
