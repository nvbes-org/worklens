import { invoke, isTauri } from '@tauri-apps/api/core';
import type { JsonValue, Operation, Request, Response } from '@worklens/contracts';

declare global {
  interface Window {
    __WORKLENS_TRANSPORT__?: (request: Request) => Promise<Response>;
  }
}

export async function query<T>(
  operation: Operation,
  repository: string | null = null,
  params: JsonValue = {},
): Promise<T> {
  const request: Request = { version: 1, operation, repository, params };
  let response: Response;
  if (import.meta.env.MODE === 'test' && window.__WORKLENS_TRANSPORT__) {
    response = await window.__WORKLENS_TRANSPORT__(request);
  } else if (isTauri()) {
    response = await invoke<Response>('query', { request });
  } else {
    throw new Error('Open the Worklens desktop application to connect to the local engine.');
  }
  if (response.version !== 1) throw new Error('Worklens versions do not match. Restart desktop and CLI.');
  if (response.error) throw new Error(response.error);
  return response.data as T;
}

export async function openUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com')
    throw new Error('Only GitHub HTTPS links can be opened.');
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function openSource(repository: string, path: string, editor = false) {
  await invoke('open_source', { repository, path, editor });
}

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
export function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function num(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}
