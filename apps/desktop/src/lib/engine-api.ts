import type { EngineActionResponse, EngineInfo, EngineRealtimeStatus, JsonValue } from '@worklens/contracts';
import { query } from './api';

export async function getEnginesList(): Promise<EngineInfo[]> {
  return query<EngineInfo[]>('engines_list');
}

export async function getEnginesRealtimeList(repositoryPath?: string): Promise<EngineRealtimeStatus[]> {
  return query<EngineRealtimeStatus[]>('engine_realtime_list', repositoryPath ?? null);
}

export async function getEngineRealtimeStatus(
  engineId: string,
  repositoryPath?: string,
): Promise<EngineRealtimeStatus> {
  return query<EngineRealtimeStatus>('engine_realtime_status', repositoryPath ?? null, {
    engineId,
  } as unknown as JsonValue);
}

export async function executeEngineAction(
  engineId: string,
  action: string,
  params?: Record<string, unknown>,
  repositoryPath?: string,
): Promise<EngineActionResponse> {
  return query<EngineActionResponse>('engine_execute', repositoryPath ?? null, {
    engineId,
    action,
    params: params ?? {},
  } as unknown as JsonValue);
}
