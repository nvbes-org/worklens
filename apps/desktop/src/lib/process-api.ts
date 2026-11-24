import { query } from './api';
import type {
  AutoKillEvent,
  AutoKillPolicy,
  DebugMode,
  DiscoveredCommand,
  EnvironmentProfile,
  JsonValue,
  MachineResources,
  ProcessInfo,
  ProcessJournalEntry,
} from '@worklens/contracts';

export async function getMachineResources(): Promise<MachineResources> {
  return query<MachineResources>('machine_resources_get');
}

export async function getProcesses(repositoryPath?: string): Promise<ProcessInfo[]> {
  return query<ProcessInfo[]>('process_list', repositoryPath ?? null);
}

export async function startProcess(
  params: {
    command: string;
    args?: string[];
    cwd?: string;
    componentId?: string;
    profileId?: string;
    envOverrides?: Record<string, string>;
    debugMode?: DebugMode;
  },
  repositoryPath?: string,
): Promise<ProcessInfo> {
  return query<ProcessInfo>('process_start', repositoryPath ?? null, params as unknown as JsonValue);
}

export async function stopProcess(id: string): Promise<void> {
  await query<{ success: boolean }>('process_stop', null, { id });
}

export async function killProcess(id: string): Promise<void> {
  await query<{ success: boolean }>('process_kill', null, { id });
}

export async function restartProcess(
  params: {
    id: string;
    command: string;
    args?: string[];
    cwd?: string;
    componentId?: string;
    profileId?: string;
    debugMode?: DebugMode;
  },
  repositoryPath?: string,
): Promise<ProcessInfo> {
  return query<ProcessInfo>('process_restart', repositoryPath ?? null, params as unknown as JsonValue);
}

export async function sendProcessInput(id: string, input: string): Promise<void> {
  await query<{ success: boolean }>('process_send_input', null, { id, input });
}

export async function getProcessLogs(id: string, search?: string, limit = 300): Promise<ProcessJournalEntry[]> {
  return query<ProcessJournalEntry[]>('process_logs', null, {
    id,
    search: search ?? null,
    limit,
  });
}

export async function clearProcessLogs(id: string): Promise<void> {
  await query<{ success: boolean }>('process_clear_logs', null, { id });
}

export async function getDiscoveredCommands(repositoryPath?: string): Promise<DiscoveredCommand[]> {
  return query<DiscoveredCommand[]>('discovered_commands_list', repositoryPath ?? null);
}

export async function getAutoKillPolicy(): Promise<AutoKillPolicy> {
  return query<AutoKillPolicy>('auto_kill_policy_get');
}

export async function setAutoKillPolicy(policy: AutoKillPolicy): Promise<void> {
  await query<{ success: boolean }>('auto_kill_policy_set', null, policy as unknown as JsonValue);
}

export async function getAutoKillEvents(): Promise<AutoKillEvent[]> {
  return query<AutoKillEvent[]>('auto_kill_events_list');
}

export async function getEnvironmentProfiles(): Promise<EnvironmentProfile[]> {
  return query<EnvironmentProfile[]>('environment_profiles_list');
}

export async function saveEnvironmentProfile(profile: EnvironmentProfile): Promise<void> {
  await query<{ success: boolean }>('environment_profile_save', null, profile as unknown as JsonValue);
}

export async function deleteEnvironmentProfile(id: string): Promise<void> {
  await query<{ success: boolean }>('environment_profile_delete', null, { id });
}
