import type { CloudScanResult } from '@worklens/contracts';
import { Cloud, Cpu, Database, GitBranch, HardDrive, Layers, Network, Server, Shield } from 'lucide-react';
import { Badge } from '../ui/badge';

interface CloudStatsBarProps {
  data: CloudScanResult;
  selectedProvider: string;
  onSelectProvider: (provider: string) => void;
}

export function CloudStatsBar({ data, selectedProvider, onSelectProvider }: CloudStatsBarProps) {
  const { stats, pipelines } = data;

  const awsCount = stats.by_provider.aws ?? 0;
  const gcpCount = stats.by_provider.gcp ?? 0;
  const scwCount = stats.by_provider.scaleway ?? 0;

  const computeCount = stats.by_category.compute ?? 0;
  const storageCount = stats.by_category.storage ?? 0;
  const dbCount = stats.by_category.database ?? 0;
  const netCount = stats.by_category.network ?? 0;
  const secCount = stats.by_category.security ?? 0;
  const _k8sCount = stats.by_category.containers_k8s ?? 0;

  return (
    <div className="space-y-3">
      {/* Provider Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1.5">
          <Cloud className="size-3.5" /> Providers:
        </span>

        <button
          type="button"
          onClick={() => onSelectProvider('all')}
          className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors border ${
            selectedProvider === 'all'
              ? 'bg-foreground text-background border-foreground shadow-sm'
              : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/80'
          }`}
        >
          All ({stats.total_resources})
        </button>

        <button
          type="button"
          onClick={() => onSelectProvider('aws')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md font-medium transition-colors border ${
            selectedProvider === 'aws'
              ? 'bg-amber-500 text-black border-amber-500 font-semibold shadow-sm'
              : 'bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20'
          }`}
        >
          <span className="size-2 rounded-full bg-amber-500" />
          AWS ({awsCount})
        </button>

        <button
          type="button"
          onClick={() => onSelectProvider('gcp')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md font-medium transition-colors border ${
            selectedProvider === 'gcp'
              ? 'bg-blue-600 text-white border-blue-600 font-semibold shadow-sm'
              : 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
          }`}
        >
          <span className="size-2 rounded-full bg-blue-500" />
          Google Cloud ({gcpCount})
        </button>

        <button
          type="button"
          onClick={() => onSelectProvider('scaleway')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md font-medium transition-colors border ${
            selectedProvider === 'scaleway'
              ? 'bg-purple-600 text-white border-purple-600 font-semibold shadow-sm'
              : 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20'
          }`}
        >
          <span className="size-2 rounded-full bg-purple-500" />
          Scaleway ({scwCount}
          {data.stats.live_scaleway_resources > 0 ? ` · ${data.stats.live_scaleway_resources} live` : ''})
        </button>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total Cloud Resources */}
        <div className="rounded-lg border border-border bg-card p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Resources Clés</span>
            <Server className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">{stats.total_resources}</span>
            <span className="text-xs text-muted-foreground">infrastructures</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            {computeCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded">
                <Cpu className="size-3 text-emerald-500" /> {computeCount} vm
              </span>
            )}
            {dbCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded">
                <Database className="size-3 text-cyan-500" /> {dbCount} db
              </span>
            )}
            {storageCount > 0 && (
              <span className="inline-flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded">
                <HardDrive className="size-3 text-amber-500" /> {storageCount} bucket
              </span>
            )}
          </div>
        </div>

        {/* CI/CD & Deployments */}
        <div className="rounded-lg border border-border bg-card p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Pipelines CI/CD</span>
            <GitBranch className="size-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">{stats.pipelines_count}</span>
            <span className="text-xs text-muted-foreground">workflows GitHub</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px]">
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5 bg-blue-500/10 text-blue-400 border-blue-500/20"
            >
              {pipelines.filter((p) => p.is_iac).length} IaC deployers
            </Badge>
          </div>
        </div>

        {/* Network & Security */}
        <div className="rounded-lg border border-border bg-card p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Réseau & Sécurité</span>
            <Shield className="size-4 text-purple-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">{netCount + secCount}</span>
            <span className="text-xs text-muted-foreground">règles & VPC</span>
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Network className="size-3 text-indigo-400" /> {netCount} net
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Shield className="size-3 text-rose-400" /> {secCount} sec/iam
            </span>
          </div>
        </div>

        {/* Infrastructure as Code */}
        <div className="rounded-lg border border-border bg-card p-3.5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Fichiers IaC & Tofu</span>
            <Layers className="size-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">{stats.iac_files_count}</span>
            <span className="text-xs text-muted-foreground">fichiers tf/tofu</span>
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{stats.modules_count} modules</span>
            <span>·</span>
            <span>{data.variables.length} vars</span>
            <span>·</span>
            <span>{data.outputs.length} outputs</span>
          </div>
        </div>
      </div>
    </div>
  );
}
