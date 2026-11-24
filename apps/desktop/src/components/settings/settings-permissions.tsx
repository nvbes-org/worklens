import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PermissionAuditEntry,
  PermissionCheckResult,
  PermissionGrant,
  PermissionType,
} from '@worklens/contracts';
import { CheckCircle2, KeyRound, Play, RefreshCw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { PreferenceRow, SettingsSection } from './settings-common';

export function SettingsPermissions() {
  const qc = useQueryClient();
  const { repo } = useSession();
  const [testPluginId, setTestPluginId] = useState('cargo');
  const [testBinary, setTestBinary] = useState('cargo');
  const [testResult, setTestResult] = useState<PermissionCheckResult | null>(null);

  const { data: grants = [], refetch: refetchGrants } = useQuery({
    queryKey: ['permission_grants'],
    queryFn: () => query<PermissionGrant[]>('permission_grants_list'),
  });

  const { data: auditLogs = [], refetch: refetchAudit } = useQuery({
    queryKey: ['permission_audit_logs'],
    queryFn: () => query<PermissionAuditEntry[]>('permission_audit_list', null, { limit: 25 }),
    refetchInterval: 5000,
  });

  const checkMutation = useMutation({
    mutationFn: () => {
      const permission: PermissionType = {
        kind: 'exec_command',
        binary: testBinary,
        allowed_args_patterns: ['.*'],
        allow_mutation: false,
      };
      return query<PermissionCheckResult>('permission_check', null, {
        pluginId: testPluginId,
        permission,
        repositoryPath: repo?.path ?? null,
      });
    },
    onSuccess: (data) => setTestResult(data),
  });

  const revokeMutation = useMutation({
    mutationFn: (grant: PermissionGrant) => {
      const updated: PermissionGrant = { ...grant, status: 'revoked' };
      return query<{ saved: boolean }>('permission_grant_set', null, updated);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permission_grants'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/20 p-4">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            <span className="text-sm font-semibold">Zero-Trust Capability Manager</span>
            <Badge variant="outline" className="border-primary/30 text-primary">
              Granular Sandbox
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Repo Trust:{' '}
            {repo
              ? repo.trusted
                ? 'Trusted (Tool execution enabled)'
                : 'Untrusted (Safe read-only confinement)'
              : 'No repo loaded'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void refetchGrants();
              void refetchAudit();
            }}
          >
            <RefreshCw className="mr-1.5 size-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <SettingsSection
        title="Permission Capability Tester"
        description="Verify whether an action is permitted before running engines or tools"
      >
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Plugin / Engine ID:</span>
              <Input
                className="w-36 text-xs"
                value={testPluginId}
                onChange={(e) => setTestPluginId(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Exec Binary:</span>
              <Input
                className="w-36 text-xs"
                value={testBinary}
                onChange={(e) => setTestBinary(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={() => checkMutation.mutate()} disabled={checkMutation.isPending}>
              <Play className="mr-1.5 size-3.5" />
              Evaluate
            </Button>
          </div>
          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-lg p-3 text-xs ${
                testResult.allowed
                  ? 'bg-emerald-500/10 text-emerald-700'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {testResult.allowed ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <XCircle className="size-4 shrink-0" />
              )}
              <span>
                <strong>{testResult.allowed ? 'ALLOWED' : 'DENIED'}</strong>: {testResult.reason}
              </span>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Active Plugin Grants"
        description="Explicit capability grants persisted in SQLite"
      >
        {grants.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No custom plugin grants assigned yet. Default built-in engines run under workspace trust policies.
          </div>
        ) : (
          grants.map((g) => (
            <PreferenceRow
              key={`${g.pluginId}-${g.permissionId}`}
              title={`${g.pluginId} · ${g.permission.kind}`}
              description={`Status: ${g.status} ${g.grantedAt ? `(granted ${new Date(g.grantedAt).toLocaleDateString()})` : ''}`}
            >
              <div className="flex items-center gap-2">
                <Badge variant={g.status === 'granted' ? 'default' : 'secondary'}>{g.status}</Badge>
                {g.status === 'granted' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => revokeMutation.mutate(g)}
                  >
                    Revoke
                  </Button>
                )}
              </div>
            </PreferenceRow>
          ))
        )}
      </SettingsSection>

      <SettingsSection
        title="Security Audit Logs"
        description="Persistent tamper-evident record of all capability evaluation decisions"
      >
        <div className="divide-y divide-border/60 font-mono text-[11px]">
          {auditLogs.length === 0 ? (
            <div className="p-6 text-center font-sans text-xs text-muted-foreground">
              No audit entries recorded yet.
            </div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-4 p-3 hover:bg-muted/30">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] uppercase font-mono px-1.5 py-0 ${
                        log.decision === 'ALLOW'
                          ? 'border-emerald-600/30 text-emerald-600'
                          : 'border-destructive/30 text-destructive'
                      }`}
                    >
                      {log.decision}
                    </Badge>
                    <span className="font-semibold text-foreground">{log.pluginId}</span>
                    <span className="text-muted-foreground">({log.action})</span>
                  </div>
                  <div className="truncate text-muted-foreground">
                    <span className="text-foreground">{log.resource}</span> — {log.reason}
                  </div>
                </div>
                <div className="shrink-0 text-muted-foreground font-sans text-[10px]">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
