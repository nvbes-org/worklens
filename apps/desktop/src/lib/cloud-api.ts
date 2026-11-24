import type {
  CloudProvider,
  CloudResourceCategory,
  CloudScanResult,
  JsonValue,
  ScalewayLiveReport,
} from '@worklens/contracts';
import { query } from './api';

export async function getCloudScan(repositoryPath?: string, refresh = false): Promise<CloudScanResult> {
  return query<CloudScanResult>('cloud_scan', repositoryPath ?? null, { refresh } as unknown as JsonValue);
}

export async function getScalewayAuthStatus(): Promise<{
  connected: boolean;
  source: string;
  projectId?: string;
}> {
  return query<{ connected: boolean; source: string; projectId?: string }>('scaleway_auth_status');
}

export async function setScalewayAuth(
  secretKey: string,
  projectId?: string,
): Promise<{ saved: boolean; connected: boolean }> {
  return query<{ saved: boolean; connected: boolean }>('scaleway_auth_set', null, {
    secretKey,
    projectId,
  } as unknown as JsonValue);
}

export async function logoutScaleway(): Promise<{ connected: boolean }> {
  return query<{ connected: boolean }>('scaleway_auth_logout');
}

export async function fetchScalewayLive(projectId?: string): Promise<ScalewayLiveReport> {
  return query<ScalewayLiveReport>('scaleway_live_fetch', null, { projectId } as unknown as JsonValue);
}

export function formatProviderName(provider: CloudProvider): string {
  if (provider === 'aws') return 'AWS';
  if (provider === 'gcp') return 'Google Cloud';
  if (provider === 'scaleway') return 'Scaleway';
  if (provider === 'azure') return 'Azure';
  if (typeof provider === 'object' && provider && 'other' in provider) {
    return provider.other.toUpperCase();
  }
  return String(provider);
}

export function getProviderBadgeStyle(provider: CloudProvider): { bg: string; text: string; border: string } {
  if (provider === 'aws') {
    return {
      bg: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      text: 'text-amber-500',
      border: 'border-amber-500/30',
    };
  }
  if (provider === 'gcp') {
    return {
      bg: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      text: 'text-blue-500',
      border: 'border-blue-500/30',
    };
  }
  if (provider === 'scaleway') {
    return {
      bg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      text: 'text-purple-400',
      border: 'border-purple-500/30',
    };
  }
  if (provider === 'azure') {
    return {
      bg: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
      text: 'text-sky-400',
      border: 'border-sky-500/30',
    };
  }
  return {
    bg: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    text: 'text-zinc-400',
    border: 'border-zinc-500/30',
  };
}

export function formatCategoryName(category: CloudResourceCategory): string {
  switch (category) {
    case 'compute':
      return 'Compute / VMs';
    case 'storage':
      return 'Storage & Buckets';
    case 'database':
      return 'Databases & Cache';
    case 'network':
      return 'Network & VPC';
    case 'security':
      return 'Security & IAM';
    case 'containers_k8s':
      return 'Kubernetes & Containers';
    default:
      return 'Other Infrastructure';
  }
}
