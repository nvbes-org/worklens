import { Empty, ErrorNotice, ExternalLink, Loading, PageTitle } from '../components/common';
import { Badge } from '../components/ui/badge';
import { useAgents } from '../lib/session';

export function AgentsPage() {
  const agents = useAgents();
  return (
    <>
      <PageTitle
        title="Agent activity"
        description="Explicit task declarations. A recent heartbeat indicates presence, not verified progress."
      />
      <ErrorNotice error={agents.error} />
      {agents.isPending && <Loading />}
      {agents.data?.length === 0 ? (
        <Empty title="Your agents have not checked in yet">
          Connect Worklens MCP or use worklens agent start, then report progress and heartbeats. Instructions
          are in the integration guide.
        </Empty>
      ) : (
        <div className="divide-y rounded-xl border bg-white">
          {agents.data?.map((agent) => (
            <article key={agent.id} className="p-5">
              <div className="flex items-center gap-3">
                <span
                  className={`size-2 rounded-full ${agent.presence === 'recent' ? 'bg-emerald-600' : 'bg-slate-300'}`}
                />
                <h2 className="font-medium">{agent.tool}</h2>
                <Badge variant="secondary">{agent.state}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">
                  Presence {agent.presence} · {new Date(agent.lastSeen).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-3 text-sm">{agent.objective}</p>
              {agent.message && <p className="mt-2 text-sm text-muted-foreground">{agent.message}</p>}
              <p className="mt-3 font-mono text-xs text-muted-foreground">{agent.worktree}</p>
              <div className="mt-3 flex gap-3">
                {agent.pr?.startsWith('https://github.com/') && (
                  <ExternalLink url={agent.pr}>Pull request</ExternalLink>
                )}
                {agent.issue?.startsWith('https://github.com/') && (
                  <ExternalLink url={agent.issue}>Issue</ExternalLink>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
