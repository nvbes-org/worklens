import type { ComponentMetadata as Metadata } from '@worklens/contracts';
import { useState } from 'react';
import { query } from '../lib/api';
import type { ComponentProject } from '../lib/component-graph';
import { useSession } from '../lib/session';
import { ErrorNotice } from './common';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function ComponentMetadata({ project }: { project: ComponentProject }) {
  const { repo } = useSession();
  const [data, setData] = useState<Metadata | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [base, setBase] = useState('main');
  const [head, setHead] = useState('HEAD');
  const [checkAffected, setCheckAffected] = useState(false);
  const nx = project.members.some((member) => member.ecosystem === 'nx');
  async function inspect() {
    setBusy(true);
    setError('');
    try {
      setData(
        await query<Metadata>('component_metadata', repo?.path, {
          memberIds: project.members.map((member) => member.id),
          checkAffected,
          base,
          head,
        }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-7 space-y-3" aria-label="Component metadata">
      <h3 className="text-xs font-medium">Technical details</h3>
      {nx && (
        <>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={checkAffected}
              disabled={!repo?.trusted}
              onChange={(e) => setCheckAffected(e.target.checked)}
            />
            Check Nx affected
          </label>
          {!repo?.trusted && (
            <p className="text-[10px] text-muted-foreground">Repository trust required for Nx.</p>
          )}
          {checkAffected && (
            <div className="flex gap-2">
              <Input
                aria-label="Nx base revision"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="Base"
              />
              <Input
                aria-label="Nx head revision"
                value={head}
                onChange={(e) => setHead(e.target.value)}
                placeholder="Head"
              />
            </div>
          )}
        </>
      )}
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void inspect()}>
        {busy ? 'Collecting…' : data ? 'Refresh details' : 'Analyze component'}
      </Button>
      <ErrorNotice error={error} />
      {data && (
        <>
          <dl className="space-y-3 break-words text-xs">
            {[
              [
                'Size',
                data.sizeBytes === null
                  ? 'Unavailable'
                  : `${data.sizeBytes.toLocaleString()} bytes · ${data.fileCount} files`,
              ],
              ['First visible Git commit', data.firstCommitAt ?? 'Unavailable'],
              ['Last file modification', data.modifiedAt ?? 'Unavailable'],
              [
                'Working tree changes',
                data.dirty === null ? 'Unavailable' : data.dirty ? 'Modified' : 'Clean',
              ],
              ['Nx affected', data.nx.affected === null ? 'Unavailable' : data.nx.affected ? 'Yes' : 'No'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[10px] text-muted-foreground">{data.sizeScope}</p>
          <p className="break-all text-[10px] text-muted-foreground">
            {data.nx.reason}
            {data.nx.affected !== null && ` · ${data.nx.base} → ${data.nx.head}`}
          </p>
          {data.lastCommit && (
            <details>
              <summary className="cursor-pointer text-xs">Last modifying commit</summary>
              <p className="mt-2 break-all font-mono text-[10px]">{data.lastCommit.sha}</p>
              <p className="text-xs">{data.lastCommit.subject}</p>
              <p className="text-[10px] text-muted-foreground">
                {data.lastCommit.author} · {data.lastCommit.date}
              </p>
            </details>
          )}
          <details>
            <summary className="cursor-pointer text-xs">Integrity · {data.integrity.length} sources</summary>
            {data.integrity.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">No exact checksum available.</p>
            )}
            {data.integrity.map((record) => (
              <div key={`${record.source}:${record.value}`} className="mt-3 space-y-1 break-all text-[10px]">
                <p>
                  {record.algorithm} · {record.source}
                </p>
                <code>{record.value}</code>
                <p className="text-muted-foreground">{record.scope}</p>
              </div>
            ))}
          </details>
          {data.warnings.map((warning) => (
            <p key={warning} className="text-[10px] text-amber-800">
              {warning}
            </p>
          ))}
          <p className="text-[10px] text-muted-foreground">Collected {data.collectedAt}</p>
        </>
      )}
    </section>
  );
}
