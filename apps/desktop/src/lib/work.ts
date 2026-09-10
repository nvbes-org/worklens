import { useQueryClient } from '@tanstack/react-query';
import type { WorkChange, WorkItem, WorkResult, WorkState } from '@worklens/contracts';
import { useRef } from 'react';
import { query } from './api';
import { useSession } from './session';

export const workStates: WorkState[] = [
  'todo',
  'in_progress',
  'waiting',
  'blocked',
  'completed',
  'abandoned',
];

export function useWorkChange() {
  const { repo } = useSession();
  const client = useQueryClient();
  const pending = useRef<{ signature: string; eventId: string } | null>(null);
  return async (item: Pick<WorkItem, 'id' | 'revision'>, change: WorkChange) => {
    if (!repo) throw new Error('Open a repository first');
    const operation = {
      create: 'work_create',
      update: 'work_update',
      link: 'work_link',
      unlink: 'work_unlink',
      note: 'work_note',
    } as const;
    const signature = JSON.stringify([repo.id, item, change]);
    if (pending.current?.signature !== signature)
      pending.current = { signature, eventId: crypto.randomUUID() };
    const result = await query<WorkResult>(operation[change.action], repo.path, {
      id: item.id,
      eventId: pending.current.eventId,
      actor: 'desktop user (declared)',
      expectedRevision: item.revision,
      change,
    });
    pending.current = null;
    await client.invalidateQueries({ queryKey: ['work_list'] });
    await client.invalidateQueries({ queryKey: ['work_show'] });
    return result.item;
  };
}
