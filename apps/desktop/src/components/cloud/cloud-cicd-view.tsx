import type { CloudDeploymentPipeline } from '@worklens/contracts';
import { ExternalLink, GitBranch, Key, Layers, Play, Rocket, Terminal } from 'lucide-react';
import { openSource } from '../../lib/api';
import { formatProviderName, getProviderBadgeStyle } from '../../lib/cloud-api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface CloudCicdViewProps {
  pipelines: CloudDeploymentPipeline[];
  repositoryPath: string;
}

export function CloudCicdView({ pipelines, repositoryPath }: CloudCicdViewProps) {
  if (pipelines.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center space-y-3">
        <GitBranch className="size-8 mx-auto text-muted-foreground/60" />
        <h3 className="text-sm font-semibold text-foreground">Aucun pipeline CI/CD GitHub détecté</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Les fichiers de workflows situés dans <code>.github/workflows/*.yml</code> contenant des étapes de
          déploiement (AWS, GCP, Scaleway, Terraform, Docker) apparaîtront automatiquement ici.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Rocket className="size-4 text-primary" />
            Pipelines de Déploiement GitHub Actions ({pipelines.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Workflows CI/CD configurés pour le déploiement cloud, la gestion d'infrastructure et la release.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pipelines.map((pipeline) => {
          return (
            <div
              key={pipeline.id}
              className="rounded-xl border border-border bg-card p-4 space-y-3.5 shadow-2xs hover:border-primary/40 transition-colors"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{pipeline.name}</span>
                    {pipeline.is_iac && (
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30"
                      >
                        Terraform / IaC
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {pipeline.file_path}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs flex items-center gap-1 shrink-0"
                  onClick={() => void openSource(repositoryPath, pipeline.file_path, true)}
                >
                  Workflow <ExternalLink className="size-3" />
                </Button>
              </div>

              {/* Providers & Environments */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {pipeline.providers.map((p) => {
                  const style = getProviderBadgeStyle(p);
                  return (
                    <span
                      key={String(p)}
                      className={`text-[10px] px-2 py-0.5 rounded font-medium border ${style.bg}`}
                    >
                      {formatProviderName(p)}
                    </span>
                  );
                })}

                {pipeline.environments.map((env) => (
                  <Badge
                    key={env}
                    variant="outline"
                    className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  >
                    Env: {env}
                  </Badge>
                ))}
              </div>

              {/* Triggers */}
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <Play className="size-3 text-blue-400" /> Événements Déclencheurs :
                </span>
                <div className="flex flex-wrap gap-1">
                  {pipeline.triggers.map((t) => (
                    <span
                      key={t}
                      className="font-mono text-[10px] bg-muted/80 text-foreground px-2 py-0.5 rounded border border-border/50"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Deploy Jobs */}
              {pipeline.deploy_jobs.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Terminal className="size-3 text-primary" /> Jobs de Déploiement :
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {pipeline.deploy_jobs.map((job) => (
                      <span
                        key={job}
                        className="font-mono text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20"
                      >
                        {job}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions & Steps Detected */}
              {pipeline.detected_actions.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Layers className="size-3 text-purple-400" /> Actions & Connecteurs :
                  </span>
                  <div className="space-y-1 font-mono text-[10px]">
                    {pipeline.detected_actions.map((act) => (
                      <div
                        key={act}
                        className="text-muted-foreground truncate bg-muted/40 px-2 py-0.5 rounded"
                      >
                        {act}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Secrets Audit */}
              {pipeline.secrets_used.length > 0 && (
                <div className="space-y-1 border-t border-border/50 pt-2">
                  <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Key className="size-3 text-amber-500" /> Secrets & Identifiants Référencés :
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {pipeline.secrets_used.map((sec) => (
                      <span
                        key={sec}
                        className="font-mono text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded"
                      >
                        {sec}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
