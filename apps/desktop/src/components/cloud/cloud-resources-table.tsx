import type { CloudResource, CloudResourceCategory } from '@worklens/contracts';
import { ChevronDown, ChevronRight, ExternalLink, Filter, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { openSource } from '../../lib/api';
import { formatCategoryName, formatProviderName, getProviderBadgeStyle } from '../../lib/cloud-api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface CloudResourcesTableProps {
  resources: CloudResource[];
  selectedProvider: string;
  repositoryPath: string;
}

export function CloudResourcesTable({
  resources,
  selectedProvider,
  repositoryPath,
}: CloudResourcesTableProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return resources.filter((r) => {
      // Provider filter
      if (selectedProvider !== 'all') {
        const provStr = typeof r.provider === 'string' ? r.provider : (r.provider as { other: string }).other;
        if (provStr !== selectedProvider) return false;
      }
      // Category filter
      if (selectedCategory !== 'all' && r.category !== selectedCategory) {
        return false;
      }
      // Search
      if (search) {
        const q = search.toLowerCase();
        const matchesName = r.name.toLowerCase().includes(q);
        const matchesType = r.resource_type.toLowerCase().includes(q);
        const matchesRegion = (r.region ?? '').toLowerCase().includes(q);
        const matchesEnv = (r.environment ?? '').toLowerCase().includes(q);
        const matchesFile = r.source_file.toLowerCase().includes(q);
        return matchesName || matchesType || matchesRegion || matchesEnv || matchesFile;
      }
      return true;
    });
  }, [resources, selectedProvider, selectedCategory, search]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleOpenSource = (res: CloudResource) => {
    if (repositoryPath) {
      void openSource(repositoryPath, res.source_file, true);
    }
  };

  return (
    <div className="space-y-3">
      {/* Search and Category Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Rechercher une ressource, type, région, fichier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs bg-background"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
            <Filter className="size-3" /> Catégorie:
          </span>
          {(['all', 'compute', 'storage', 'database', 'network', 'security', 'containers_k8s'] as const).map(
            (cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-0.5 text-[11px] rounded-md font-medium transition-colors border ${
                  selectedCategory === cat
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/80'
                }`}
              >
                {cat === 'all' ? 'Toutes' : formatCategoryName(cat as CloudResourceCategory).split(' ')[0]}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Resources Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border text-[11px]">
              <tr>
                <th className="py-2.5 pl-3 pr-2 w-8" />
                <th className="py-2.5 px-3">Fournisseur</th>
                <th className="py-2.5 px-3">Nom & Type</th>
                <th className="py-2.5 px-3">Catégorie</th>
                <th className="py-2.5 px-3">Région / Env</th>
                <th className="py-2.5 px-3">Fichier Source</th>
                <th className="py-2.5 pr-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Aucune ressource cloud ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const style = getProviderBadgeStyle(r.provider);
                  const isExpanded = expandedId === r.id;

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-muted/30 transition-colors group ${
                        isExpanded ? 'bg-muted/20' : ''
                      }`}
                    >
                      <td className="py-2 pl-3 pr-1 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpand(r.id)}
                          className="p-1 text-muted-foreground hover:text-foreground rounded"
                          aria-label="Toggle details"
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-3.5" />
                          ) : (
                            <ChevronRight className="size-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium border ${style.bg}`}>
                          {formatProviderName(r.provider)}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-foreground">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{r.resource_type}</div>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                        {formatCategoryName(r.category)}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {r.region && (
                            <span className="font-mono text-[11px] text-foreground bg-muted px-1.5 py-0.5 rounded">
                              {r.region}
                            </span>
                          )}
                          {r.environment && (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium">
                              {r.environment}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground font-mono text-[11px] truncate max-w-[160px]">
                        {r.source_file}
                        {r.line_number && <span className="text-muted-foreground/60">:{r.line_number}</span>}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleOpenSource(r)}
                        >
                          Éditeur <ExternalLink className="size-3 ml-1" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expanded item details drawer if selected */}
      {expandedId && (
        <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-2 text-xs">
          {(() => {
            const current = resources.find((r) => r.id === expandedId);
            if (!current) return null;
            return (
              <div>
                <div className="font-semibold text-foreground mb-1.5 flex items-center justify-between">
                  <span>Détails & Attributs de la Ressource : {current.name}</span>
                  <span className="font-mono text-muted-foreground">{current.resource_type}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="bg-background/80 p-2 rounded border border-border space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium">
                      Attributs de configuration
                    </span>
                    <div className="font-mono text-[11px] space-y-0.5 max-h-40 overflow-y-auto">
                      {Object.entries(current.attributes).map(([k, v]) => (
                        <div key={k} className="flex justify-between border-b border-border/20 py-0.5">
                          <span className="text-muted-foreground">{k}:</span>
                          <span className="text-foreground">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-background/80 p-2 rounded border border-border space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium">Tags & Métadonnées</span>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {Object.entries(current.tags).map(([k, v]) => (
                        <Badge key={k} variant="secondary" className="text-[10px] font-mono">
                          {k}={v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
