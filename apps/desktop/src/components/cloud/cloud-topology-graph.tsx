import type { CloudArchitectureGraph, CloudDeploymentPipeline, CloudResource } from '@worklens/contracts';
import { ArrowRight, Boxes, ExternalLink, GitBranch, Radio, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { openSource } from '../../lib/api';
import { formatCategoryName, formatProviderName, getProviderBadgeStyle } from '../../lib/cloud-api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface CloudTopologyGraphProps {
  architecture: CloudArchitectureGraph;
  resources: CloudResource[];
  pipelines: CloudDeploymentPipeline[];
  selectedProvider: string;
  repositoryPath: string;
}

export function CloudTopologyGraph({
  architecture,
  resources,
  pipelines,
  selectedProvider,
  repositoryPath,
}: CloudTopologyGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Filter architecture nodes by provider
  const filteredNodes = useMemo(() => {
    if (selectedProvider === 'all') return architecture.nodes;
    return architecture.nodes.filter((n) => {
      if (typeof n.provider === 'string') return n.provider === selectedProvider;
      if (typeof n.provider === 'object' && 'other' in n.provider) {
        return n.provider.other === selectedProvider;
      }
      return false;
    });
  }, [architecture.nodes, selectedProvider]);

  // Edges touching filtered nodes
  const visibleNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const activeEdges = useMemo(() => {
    return architecture.edges.filter((e) => visibleNodeIds.has(e.source) || visibleNodeIds.has(e.target));
  }, [architecture.edges, visibleNodeIds]);

  // Selected node & its connections
  const selectedNode = useMemo(
    () => architecture.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [architecture.nodes, selectedNodeId],
  );

  const connectedEdges = useMemo(() => {
    if (!selectedNodeId) return [];
    return architecture.edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId);
  }, [architecture.edges, selectedNodeId]);

  const selectedResource = useMemo(() => {
    if (!selectedNodeId) return null;
    return resources.find((r) => r.id === selectedNodeId) ?? null;
  }, [resources, selectedNodeId]);

  const handleOpenSource = (filePath?: string) => {
    if (repositoryPath && filePath) {
      void openSource(repositoryPath, filePath, true);
    }
  };

  return (
    <div className="relative rounded-xl border border-border bg-card/60 p-4 space-y-4 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Boxes className="size-4 text-primary" />
            Architecture Construite d'après les Configurations Cloud
          </h3>
          <p className="text-xs text-muted-foreground">
            Topologie des relations (réseau, stockage, dépendances, déploiements) déduite de vos fichiers IaC
            et synchronisée en direct.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
            {architecture.nodes.length} Nœuds · {architecture.edges.length} Connexions
          </Badge>
        </div>
      </div>

      {/* Main Connected Architecture Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Tier 1: CI/CD Pipelines (Col 1-3) */}
        <div className="lg:col-span-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 pb-1 border-b border-border">
            <GitBranch className="size-3.5 text-blue-400" />
            Déploiements CI/CD ({pipelines.length})
          </div>

          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {pipelines.length === 0 ? (
              <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg text-center">
                Aucun pipeline.
              </div>
            ) : (
              pipelines.map((p) => {
                const isSelected = selectedNodeId === `pipeline:${p.id}`;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setSelectedNodeId(`pipeline:${p.id}`)}
                    className={`w-full text-left rounded-lg border p-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10 shadow-xs ring-1 ring-blue-500/40'
                        : 'border-border/70 bg-background/70 hover:border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="font-semibold text-xs text-foreground truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">{p.file_path}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.environments.map((e) => (
                        <span
                          key={e}
                          className="text-[9px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1 rounded"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Directed Flow Connector Arrow */}
        <div className="hidden lg:flex lg:col-span-1 flex-col items-center justify-center self-center text-muted-foreground/40">
          <ArrowRight className="size-5" />
        </div>

        {/* Tier 2: Cloud Infrastructure Tiers (Col 5-12) */}
        <div className="lg:col-span-8 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between pb-1 border-b border-border">
            <span>Infrastructures Connectées ({filteredNodes.length})</span>
            <span className="text-[11px]">{activeEdges.length} flux détectés</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[480px] overflow-y-auto pr-1">
            {filteredNodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const style = getProviderBadgeStyle(node.provider);

              return (
                <button
                  type="button"
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`text-left rounded-lg border p-2.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40'
                      : 'border-border/70 bg-background/80 hover:border-border hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${style.bg}`}>
                      {formatProviderName(node.provider)}
                    </span>

                    {/* Live indicator or environment */}
                    {node.is_live ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500 font-semibold">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live: {node.status}
                      </span>
                    ) : node.environment ? (
                      <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground">
                        {node.environment}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1.5 font-semibold text-xs text-foreground truncate">{node.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {node.metadata.resource_type ?? node.id}
                  </div>

                  {/* Connected links preview */}
                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-1.5">
                    <span>{formatCategoryName(node.category)}</span>
                    {node.metadata.public_ip && (
                      <span className="font-mono text-foreground font-medium">{node.metadata.public_ip}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Node Inspector Drawer */}
      {selectedNode && (
        <div className="p-4 rounded-xl border border-primary/30 bg-muted/30 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">{selectedNode.name}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded border ${getProviderBadgeStyle(selectedNode.provider).bg}`}
                >
                  {formatProviderName(selectedNode.provider)}
                </span>
                {selectedNode.is_live && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30 gap-1"
                  >
                    <Radio className="size-3 text-emerald-500" /> Scaleway Live
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground font-mono mt-0.5">{selectedNode.id}</div>
            </div>

            <div className="flex items-center gap-2">
              {selectedResource?.source_file && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs flex items-center gap-1"
                  onClick={() => handleOpenSource(selectedResource.source_file)}
                >
                  Éditeur <ExternalLink className="size-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setSelectedNodeId(null)}
                aria-label="Fermer"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Relations & Connections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {connectedEdges.length > 0 && (
              <div className="bg-background/80 p-3 rounded-lg border border-border space-y-1.5">
                <div className="font-semibold text-muted-foreground text-[11px]">
                  Connexions & Relations Architecturales ({connectedEdges.length})
                </div>
                <div className="space-y-1 font-mono text-[11px] max-h-36 overflow-y-auto">
                  {connectedEdges.map((e, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center border-b border-border/30 pb-0.5"
                    >
                      <span className="text-muted-foreground truncate">{e.label ?? e.relation}:</span>
                      <span className="text-foreground truncate max-w-[200px]">
                        {e.source === selectedNode.id ? `→ ${e.target}` : `← ${e.source}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(selectedNode.metadata).length > 0 && (
              <div className="bg-background/80 p-3 rounded-lg border border-border space-y-1.5">
                <div className="font-semibold text-muted-foreground text-[11px]">
                  Métadonnées & Configuration
                </div>
                <div className="space-y-1 font-mono text-[11px] max-h-36 overflow-y-auto">
                  {Object.entries(selectedNode.metadata).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-border/30 pb-0.5">
                      <span className="text-muted-foreground truncate">{k}:</span>
                      <span className="text-foreground truncate max-w-[200px]">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
