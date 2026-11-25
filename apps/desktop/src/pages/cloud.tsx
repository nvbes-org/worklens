import type { CloudScanResult } from '@worklens/contracts';
import { FileCode, GitBranch, Key, Network, Radio, RefreshCw, Server } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CloudCicdView } from '../components/cloud/cloud-cicd-view';
import { CloudIacView } from '../components/cloud/cloud-iac-view';
import { CloudResourcesTable } from '../components/cloud/cloud-resources-table';
import { CloudScalewayLiveView } from '../components/cloud/cloud-scaleway-live-view';
import { CloudStatsBar } from '../components/cloud/cloud-stats-bar';
import { CloudTopologyGraph } from '../components/cloud/cloud-topology-graph';
import { ScalewayModal } from '../components/cloud/scaleway-modal';
import { Empty, ErrorNotice, Loading } from '../components/common';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ViewHeading } from '../components/view-heading';
import { getCloudScan } from '../lib/cloud-api';
import { useSession } from '../lib/session';

export function CloudPage() {
  const { repo } = useSession();
  const repoPath = repo?.path;

  const [data, setData] = useState<CloudScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isScalewayModalOpen, setIsScalewayModalOpen] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  const loadData = useCallback(
    async (forceRefresh = false) => {
      if (!repoPath) return;
      if (forceRefresh) setRefreshing(true);
      setError(null);
      try {
        const result = await getCloudScan(repoPath, forceRefresh);
        setData(result);
        setLastRefreshedAt(new Date().toLocaleTimeString());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [repoPath],
  );

  // Initial load
  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  // Real-time polling
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadData(false);
    }, 12_000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  if (!repo) {
    return <Empty title="Dépôt requis">Ouvrez un dépôt pour analyser les configurations Cloud et CI/CD.</Empty>;
  }

  const path = repo.path;

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <ViewHeading
          section="Cloud"
          title="Cloud & Infrastructure"
          description="Parsing Terraform / OpenTofu (GCP, AWS, Scaleway), détection CI/CD GitHub et architecture en temps réel."
        />

        {/* Real-time controls */}
        <div className="flex items-center gap-2">
          {/* Live indicator */}
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
              autoRefresh
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : 'bg-muted text-muted-foreground border-border'
            }`}
            title="Activer/Désactiver le rafraîchissement automatique en temps réel"
          >
            <span
              className={`size-2 rounded-full ${
                autoRefresh
                  ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                  : 'bg-zinc-400'
              }`}
            />
            <span className="font-medium text-[11px]">{autoRefresh ? 'Temps réel actif' : 'En pause'}</span>
          </button>

          {lastRefreshedAt && (
            <span className="text-[11px] text-muted-foreground hidden md:inline">
              Scan: {lastRefreshedAt}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsScalewayModalOpen(true)}
            className="h-8 gap-1.5 text-xs border-purple-500/30 hover:bg-purple-500/10 text-purple-400"
            title="Configurer l'API Scaleway Live (Keychain sécurisé)"
          >
            <Key className="size-3.5" />
            API Scaleway
            {data?.scaleway_live?.connected && <span className="size-1.5 rounded-full bg-emerald-400" />}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData(true)}
            disabled={refreshing || loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {error && <ErrorNotice error={error} />}

      {loading && !data ? (
        <Loading />
      ) : !data ? (
        <Empty title="Aucune donnée">Aucune donnée d'infrastructure trouvée.</Empty>
      ) : (
        <div className="space-y-4">
          {/* Top KPI Metrics & Provider Filters */}
          <CloudStatsBar
            data={data}
            selectedProvider={selectedProvider}
            onSelectProvider={setSelectedProvider}
          />

          {/* Main Navigation Tabs */}
          <Tabs defaultValue="architecture" className="space-y-3">
            <TabsList className="bg-muted/60 p-1 flex-wrap">
              <TabsTrigger value="architecture" className="gap-1.5 text-xs">
                <Network className="size-3.5" /> Topologie & Architecture
              </TabsTrigger>
              <TabsTrigger value="resources" className="gap-1.5 text-xs">
                <Server className="size-3.5" /> Ressources & Config ({data.resources.length})
              </TabsTrigger>
              <TabsTrigger value="cicd" className="gap-1.5 text-xs">
                <GitBranch className="size-3.5" /> CI/CD & Déploiements ({data.pipelines.length})
              </TabsTrigger>
              <TabsTrigger value="iac" className="gap-1.5 text-xs">
                <FileCode className="size-3.5" /> IaC Modules & Backends (
                {data.modules.length + data.backends.length})
              </TabsTrigger>
              <TabsTrigger value="scaleway" className="gap-1.5 text-xs">
                <Radio className="size-3.5" /> Scaleway Live (
                {data.scaleway_live
                  ? data.scaleway_live.servers.length +
                    data.scaleway_live.databases.length +
                    data.scaleway_live.k8s_clusters.length
                  : 0}
                )
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Architecture Topology */}
            <TabsContent value="architecture" className="mt-0">
              <CloudTopologyGraph
                architecture={data.architecture}
                resources={data.resources}
                pipelines={data.pipelines}
                selectedProvider={selectedProvider}
                repositoryPath={path}
              />
            </TabsContent>

            {/* Tab 2: Resources & Configuration */}
            <TabsContent value="resources" className="mt-0">
              <CloudResourcesTable
                resources={data.resources}
                selectedProvider={selectedProvider}
                repositoryPath={path}
              />
            </TabsContent>

            {/* Tab 3: CI/CD & Deployments */}
            <TabsContent value="cicd" className="mt-0">
              <CloudCicdView pipelines={data.pipelines} repositoryPath={path} />
            </TabsContent>

            {/* Tab 4: IaC Modules & Backends */}
            <TabsContent value="iac" className="mt-0">
              <CloudIacView
                modules={data.modules}
                variables={data.variables}
                outputs={data.outputs}
                backends={data.backends}
                repositoryPath={path}
              />
            </TabsContent>

            {/* Tab 5: Scaleway Live API */}
            <TabsContent value="scaleway" className="mt-0">
              <CloudScalewayLiveView
                report={data.scaleway_live ?? null}
                resources={data.resources}
                onOpenAuthModal={() => setIsScalewayModalOpen(true)}
                onRefreshLive={() => void loadData(true)}
                loading={refreshing}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Scaleway Auth Modal */}
      <ScalewayModal
        open={isScalewayModalOpen}
        onClose={() => setIsScalewayModalOpen(false)}
        onSuccess={() => void loadData(true)}
      />
    </div>
  );
}
