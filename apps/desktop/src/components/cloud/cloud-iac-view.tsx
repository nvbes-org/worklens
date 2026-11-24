import type { CloudBackend, CloudModule, CloudOutput, CloudVariable } from '@worklens/contracts';
import { Boxes, ExternalLink, HardDrive, Lock, Sliders, Terminal } from 'lucide-react';
import { openSource } from '../../lib/api';
import { formatProviderName, getProviderBadgeStyle } from '../../lib/cloud-api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface CloudIacViewProps {
  modules: CloudModule[];
  variables: CloudVariable[];
  outputs: CloudOutput[];
  backends: CloudBackend[];
  repositoryPath: string;
}

export function CloudIacView({ modules, variables, outputs, backends, repositoryPath }: CloudIacViewProps) {
  return (
    <div className="space-y-6">
      {/* Remote Backends & State */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
          <HardDrive className="size-3.5 text-primary" />
          Stockage d'État & Remote Backends ({backends.length})
        </h4>

        {backends.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 border border-dashed rounded-lg bg-card/40">
            Aucun bloc backend déclaré (l'état utilise le stockage local par défaut ou Terraform Cloud).
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {backends.map((b, i) => (
              <div
                key={i}
                className="p-3 rounded-lg border border-border bg-card flex justify-between items-center text-xs"
              >
                <div>
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    <span className="uppercase text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                      {b.backend_type}
                    </span>
                    <span>{b.bucket_or_path ?? 'State Default'}</span>
                  </div>
                  {b.region && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">Région: {b.region}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground font-mono mt-1">{b.source_file}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => void openSource(repositoryPath, b.source_file, true)}
                >
                  <ExternalLink className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modules */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
          <Boxes className="size-3.5 text-primary" />
          Modules Terraform / OpenTofu ({modules.length})
        </h4>

        {modules.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 border border-dashed rounded-lg bg-card/40">
            Aucun module réutilisable invoqué dans la configuration.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {modules.map((m) => (
              <div key={m.name} className="p-3 rounded-lg border border-border bg-card space-y-2 text-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-semibold text-foreground">{m.name}</span>
                    <div className="text-[11px] font-mono text-muted-foreground truncate max-w-[260px]">
                      {m.source}
                    </div>
                  </div>
                  {m.version && (
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      v{m.version}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                  <div className="flex gap-1">
                    {m.providers.map((p) => {
                      const style = getProviderBadgeStyle(p);
                      return (
                        <span
                          key={String(p)}
                          className={`text-[9px] px-1.5 py-0.2 rounded border ${style.bg}`}
                        >
                          {formatProviderName(p)}
                        </span>
                      );
                    })}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] px-1 text-muted-foreground hover:text-foreground"
                    onClick={() => void openSource(repositoryPath, m.source_file, true)}
                  >
                    Voir code <ExternalLink className="size-2.5 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variables & Outputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Variables */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
            <Sliders className="size-3.5 text-blue-400" />
            Variables d'Entrée ({variables.length})
          </h4>

          {variables.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
              Aucune variable déclarée.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {variables.map((v) => (
                <div key={v.name} className="p-2.5 rounded-lg border border-border bg-card text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-foreground">{v.name}</span>
                    <div className="flex items-center gap-1">
                      {v.sensitive && (
                        <span className="text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 px-1 rounded flex items-center gap-0.5">
                          <Lock className="size-2.5" /> sensitive
                        </span>
                      )}
                      {v.var_type && (
                        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 rounded">
                          {v.var_type}
                        </span>
                      )}
                    </div>
                  </div>
                  {v.description && <p className="text-[11px] text-muted-foreground">{v.description}</p>}
                  {v.default_value && (
                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                      défaut : <span className="text-foreground">{v.default_value}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Outputs */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-2">
            <Terminal className="size-3.5 text-emerald-400" />
            Sorties & Outputs ({outputs.length})
          </h4>

          {outputs.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
              Aucun output déclaré.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {outputs.map((o) => (
                <div key={o.name} className="p-2.5 rounded-lg border border-border bg-card text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-foreground">{o.name}</span>
                    {o.sensitive && (
                      <span className="text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20 px-1 rounded flex items-center gap-0.5">
                        <Lock className="size-2.5" /> sensitive
                      </span>
                    )}
                  </div>
                  {o.description && <p className="text-[11px] text-muted-foreground">{o.description}</p>}
                  <div className="text-[10px] text-muted-foreground font-mono">{o.source_file}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
