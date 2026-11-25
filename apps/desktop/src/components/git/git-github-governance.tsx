import { useQuery } from '@tanstack/react-query';
import type {
  BoundaryViolation,
  CheckRunPayload,
  CheckRunResult,
  ImpactCommentResult,
  JsonValue,
  WorkflowDispatchResult,
} from '@worklens/contracts';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface BoundariesResponse {
  config: unknown | null;
  violations: BoundaryViolation[];
}

export function GitGithubGovernance() {
  const { repo } = useSession();
  const git = useGit();
  const headSha = git.data?.head ?? '';

  const [prNumber, setPrNumber] = useState('');
  const [workflowId, setWorkflowId] = useState('ci.yml');
  const [refName, setRefName] = useState(git.data?.branch ?? 'main');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    url?: string;
    isError?: boolean;
  } | null>(null);

  const boundaries = useQuery({
    queryKey: ['boundaries', repo?.path],
    queryFn: () => query<BoundariesResponse>('validate_boundaries', repo?.path),
    enabled: Boolean(repo?.path),
  });

  const violations = boundaries.data?.violations ?? [];
  const hasConfig = Boolean(boundaries.data?.config);

  async function handlePublishChecks() {
    if (!repo?.path || !headSha) return;
    setBusyAction('checks');
    setActionMessage(null);
    try {
      const payload: CheckRunPayload = {
        name: 'worklens/architecture-boundary',
        headSha,
        status: 'completed',
        conclusion: violations.length > 0 ? 'failure' : 'success',
        title:
          violations.length > 0
            ? `${violations.length} Architecture Boundary Violation(s)`
            : 'Architecture Boundaries Validated',
        summary:
          violations.length > 0
            ? 'Transgression of layer boundary rules detected.'
            : 'All module dependencies respect configured boundaries.',
        text: null,
        annotations: violations.map((v) => ({
          path: v.sourceManifest,
          startLine: 1,
          endLine: 1,
          annotationLevel: v.severity === 'failure' ? 'failure' : 'warning',
          title: `Boundary violation: ${v.sourceLayer} -> ${v.targetLayer}`,
          message: v.message,
        })),
      };

      const result = await query<CheckRunResult>(
        'github_publish_checks',
        repo.path,
        payload as unknown as JsonValue,
      );
      setActionMessage({
        text: `Check Run #${result.checkRunId} published (${result.conclusion})`,
        url: result.htmlUrl,
      });
    } catch (e) {
      setActionMessage({ text: String(e), isError: true });
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePostComment() {
    const num = Number.parseInt(prNumber, 10);
    if (!repo?.path || !num) return;
    setBusyAction('comment');
    setActionMessage(null);
    try {
      const result = await query<ImpactCommentResult>(
        'github_post_impact_comment',
        repo.path,
        { number: num },
      );
      setActionMessage({
        text: `PR Impact comment ${result.action} successfully on #${num}`,
        url: result.htmlUrl,
      });
    } catch (e) {
      setActionMessage({ text: String(e), isError: true });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDispatchWorkflow() {
    if (!repo?.path || !workflowId || !refName) return;
    setBusyAction('dispatch');
    setActionMessage(null);
    try {
      const result = await query<WorkflowDispatchResult>(
        'github_dispatch_workflow',
        repo.path,
        {
          workflowId,
          refName,
          inputs: {
            triggered_by: 'worklens',
            ref: refName,
          },
        },
      );
      setActionMessage({ text: result.message });
    } catch (e) {
      setActionMessage({ text: String(e), isError: true });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-500" />
            GitHub Governance & CI Dispatch
          </h2>
          <p className="text-sm text-muted-foreground">
            Architecture boundary checks, GitHub Check Runs gating, and targeted workflow triggers.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void boundaries.refetch()}
          disabled={boundaries.isFetching}
        >
          <RefreshCw className={`size-3.5 mr-1.5 ${boundaries.isFetching ? 'animate-spin' : ''}`} />
          Re-evaluate
        </Button>
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-sm flex items-center justify-between border ${
            actionMessage.isError
              ? 'bg-red-500/10 text-red-600 border-red-500/20'
              : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
          }`}
        >
          <span>{actionMessage.text}</span>
          {actionMessage.url && (
            <a
              href={actionMessage.url}
              target="_blank"
              rel="noreferrer"
              className="underline flex items-center gap-1 font-medium text-xs ml-3"
            >
              Open on GitHub <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}

      {/* Section 1: Architecture Boundaries */}
      <div className="rounded-xl border p-4 bg-card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {violations.length === 0 ? (
              <CheckCircle2 className="size-4 text-emerald-500" />
            ) : (
              <XCircle className="size-4 text-rose-500" />
            )}
            <span className="font-semibold text-sm">
              Boundary Validation Status: {violations.length === 0 ? 'Passed' : `${violations.length} Violation(s)`}
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {hasConfig ? '.worklens/boundaries.json active' : 'No .worklens/boundaries.json found'}
          </span>
        </div>

        {violations.length > 0 && (
          <div className="border rounded-lg overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2">Source</th>
                  <th className="p-2">Target</th>
                  <th className="p-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {violations.map((v, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    <td className="p-2 font-mono">
                      {v.sourceProject} ({v.sourceLayer})
                    </td>
                    <td className="p-2 font-mono">
                      {v.targetProject} ({v.targetLayer})
                    </td>
                    <td className="p-2 text-rose-500">{v.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t mt-1">
          <span className="text-xs text-muted-foreground font-mono">
            HEAD: {headSha ? headSha.slice(0, 7) : 'None'}
          </span>
          <Button
            size="sm"
            onClick={() => void handlePublishChecks()}
            disabled={!headSha || busyAction === 'checks'}
          >
            <Send className="size-3.5 mr-1.5" />
            Publish Check Run (`worklens/architecture-boundary`)
          </Button>
        </div>
      </div>

      {/* Section 2: PR Impact Summary Comment */}
      <div className="rounded-xl border p-4 bg-card flex flex-col gap-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <MessageSquare className="size-4 text-blue-500" />
          PR Impact Summary Comment (Idempotent)
        </h3>
        <p className="text-xs text-muted-foreground">
          Posts or updates a formatted architectural impact report directly on the GitHub PR.
        </p>
        <div className="flex items-center gap-2 max-w-md">
          <Input
            placeholder="PR number (e.g. 42)"
            value={prNumber}
            onChange={(e) => setPrNumber(e.target.value)}
            className="h-8 text-xs font-mono"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handlePostComment()}
            disabled={!prNumber || busyAction === 'comment'}
          >
            <Send className="size-3.5 mr-1.5" />
            Post / Update Comment
          </Button>
        </div>
      </div>

      {/* Section 3: Targeted Workflow Dispatch */}
      <div className="rounded-xl border p-4 bg-card flex flex-col gap-3">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Play className="size-4 text-purple-500" />
          Targeted CI Workflow Dispatch
        </h3>
        <p className="text-xs text-muted-foreground">
          Triggers a specific GitHub Actions workflow targeted at modified and dependent packages.
        </p>
        <div className="grid grid-cols-2 gap-2 max-w-md">
          <Input
            placeholder="Workflow ID (e.g. ci.yml)"
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
            className="h-8 text-xs font-mono"
          />
          <Input
            placeholder="Git Ref (branch or tag)"
            value={refName}
            onChange={(e) => setRefName(e.target.value)}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleDispatchWorkflow()}
            disabled={!workflowId || !refName || busyAction === 'dispatch'}
          >
            <Play className="size-3.5 mr-1.5" />
            Dispatch Workflow
          </Button>
        </div>
      </div>
    </div>
  );
}
