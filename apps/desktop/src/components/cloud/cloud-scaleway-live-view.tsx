import type { CloudResource, ScalewayLiveReport } from '@worklens/contracts';
import { CheckCircle2, Database, Key, Layers, Network, RefreshCw, Server, ShieldAlert } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface CloudScalewayLiveViewProps {
  report: ScalewayLiveReport | null;
  resources: CloudResource[];
  onOpenAuthModal: () => void;
  onRefreshLive: () => void;
  loading: boolean;
}

export function CloudScalewayLiveView({
  report,
  resources,
  onOpenAuthModal,
  onRefreshLive,
  loading,
}: CloudScalewayLiveViewProps) {
  if (!report?.connected) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center space-y-4">
        <div className="size-12 mx-auto rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
          <Key className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">API Scaleway non connectée</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Connectez votre compte Scaleway via votre Secret Key pour interroger en temps réel vos serveurs,
            bases de données relationnelles, clusters Kubernetes et réseaux privés.
          </p>
        </div>
        <Button
          onClick={onOpenAuthModal}
          size="sm"
          className="bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1.5"
        >
          <Key className="size-3.5" /> Configurer l'accès API Scaleway
        </Button>
      </div>
    );
  }

  const { servers, databases, k8s_clusters, private_networks, fetched_at } = report;

  // Correlate with IaC resources to detect managed vs unmanaged
  const iacScalewayNames = new Set(
    resources.filter((r) => r.provider === 'scaleway').map((r) => r.name.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      {/* Live Header & Sync Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/5">
        <div className="flex items-center gap-2.5">
          <span className="size-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
          <div>
            <div className="text-xs font-semibold text-foreground flex items-center gap-2">
              <span>Synchronisation Scaleway Active</span>
              <Badge
                variant="outline"
                className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/30"
              >
                Live API
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Dernière extraction à {new Date(fetched_at).toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshLive}
            disabled={loading}
            className="h-7 text-xs gap-1"
          >
            <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
            Rafraîchir Live
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenAuthModal}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            Gérer la clé
          </Button>
        </div>
      </div>

      {/* Live Servers / Instances */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Server className="size-3.5 text-purple-400" />
            Serveurs Virtuels Scaleway ({servers.length})
          </h4>
          <span className="text-[11px] text-muted-foreground">Zones : fr-par-1, fr-par-2, nl-ams-1</span>
        </div>

        {servers.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 border border-dashed rounded-lg bg-card/40 text-center">
            Aucun serveur virtuel en cours d'exécution dans ce projet Scaleway.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {servers.map((srv) => {
              const isManaged = iacScalewayNames.has(srv.name.toLowerCase());
              const isRunning = srv.status === 'running';

              return (
                <div
                  key={srv.id}
                  className="p-3.5 rounded-lg border border-border bg-card space-y-2.5 shadow-2xs hover:border-purple-500/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="truncate">
                      <div className="font-semibold text-xs text-foreground truncate">{srv.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{srv.zone}</div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] capitalize px-1.5 py-0 ${
                        isRunning
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                          : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full mr-1 ${
                          isRunning ? 'bg-emerald-500' : 'bg-zinc-400'
                        }`}
                      />
                      {srv.status}
                    </Badge>
                  </div>

                  <div className="text-xs space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Modèle :</span>
                      <span className="text-foreground font-semibold">{srv.commercial_type}</span>
                    </div>
                    {srv.public_ip && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>IP Publique :</span>
                        <span className="text-foreground">{srv.public_ip}</span>
                      </div>
                    )}
                    {srv.private_ip && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>IP Privée :</span>
                        <span className="text-foreground">{srv.private_ip}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                    <span
                      className={`inline-flex items-center gap-1 font-medium ${
                        isManaged ? 'text-emerald-500' : 'text-amber-500'
                      }`}
                    >
                      {isManaged ? (
                        <>
                          <CheckCircle2 className="size-3" /> Géré par IaC
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="size-3" /> Hors IaC
                        </>
                      )}
                    </span>
                    <span className="text-muted-foreground truncate max-w-[120px]">{srv.image_name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Databases (RDB) */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Database className="size-3.5 text-cyan-400" />
          Bases de Données Relationnelles Managées ({databases.length})
        </h4>

        {databases.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 border border-dashed rounded-lg bg-card/40 text-center">
            Aucune instance RDB trouvée.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {databases.map((db) => (
              <div key={db.id} className="p-3.5 rounded-lg border border-border bg-card space-y-2 text-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-semibold text-foreground">{db.name}</span>
                    <div className="text-[11px] font-mono text-muted-foreground">{db.engine}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                  >
                    {db.status}
                  </Badge>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground space-y-0.5">
                  <div>Noeud : {db.node_type}</div>
                  {db.endpoint && <div>Endpoint : {db.endpoint}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kubernetes Clusters & Private Networks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Kubernetes */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="size-3.5 text-indigo-400" />
            Clusters Kubernetes Kapsule ({k8s_clusters.length})
          </h4>
          {k8s_clusters.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
              Aucun cluster K8s actif.
            </div>
          ) : (
            k8s_clusters.map((c) => (
              <div key={c.id} className="p-3 rounded-lg border border-border bg-card space-y-1 text-xs">
                <div className="flex justify-between items-center font-semibold text-foreground">
                  <span>{c.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    v{c.version}
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground flex justify-between">
                  <span>CNI : {c.cni}</span>
                  <span>{c.node_count} noeuds</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Private Networks */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Network className="size-3.5 text-blue-400" />
            Réseaux Privés VPC ({private_networks.length})
          </h4>
          {private_networks.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
              Aucun réseau privé configuré.
            </div>
          ) : (
            private_networks.map((pn) => (
              <div key={pn.id} className="p-3 rounded-lg border border-border bg-card space-y-1 text-xs">
                <div className="flex justify-between items-center font-semibold text-foreground">
                  <span>{pn.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{pn.region}</span>
                </div>
                {pn.subnets.length > 0 && (
                  <div className="text-[11px] font-mono text-muted-foreground">
                    Subnets : {pn.subnets.join(', ')}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
