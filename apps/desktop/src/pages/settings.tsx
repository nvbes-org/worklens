import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Repository, ToolStatus } from '@worklens/contracts';
import { useEffect, useState } from 'react';
import { ErrorNotice, PageTitle } from '../components/common';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { openUrl, query } from '../lib/api';
import { useSession } from '../lib/session';

type Device = { id: string; userCode: string; verificationUri: string; interval: number; expiresIn: number };
export function SettingsPage() {
  const { repo, setRepo } = useSession();
  const client = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [device, setDevice] = useState<Device | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const auth = useQuery({
    queryKey: ['github-auth'],
    queryFn: () => query<{ connected: boolean; clientId: string | null }>('github_auth_status'),
  });
  const doctor = useQuery({
    queryKey: ['doctor'],
    queryFn: () => query<{ tools: ToolStatus[]; dataDirectory: string; protocol: number }>('doctor'),
  });
  useEffect(() => {
    if (!device) return;
    const timer = setInterval(() => {
      void query<{ status: string }>('github_auth_poll', null, { id: device.id })
        .then((result) => {
          if (result.status === 'connected') {
            setDevice(null);
            void client.invalidateQueries();
          }
        })
        .catch((e) => {
          setError(String(e));
          setDevice(null);
        });
    }, device.interval * 1000);
    return () => clearInterval(timer);
  }, [device, client]);
  async function connect() {
    setError('');
    setBusy(true);
    try {
      const device = await query<Device>('github_auth_start', null, {
        clientId: clientId || auth.data?.clientId || '',
      });
      setDevice(device);
      await openUrl(device.verificationUri);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function trust(trusted: boolean) {
    if (!repo) return;
    try {
      setRepo(await query<Repository>('trust', repo.path, { trusted }));
      await client.invalidateQueries({ queryKey: ['graph'] });
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <PageTitle
        title="Workspace settings"
        description="Local preferences, source connections and explicit execution trust."
      />
      <ErrorNotice error={error || auth.error || doctor.error} />
      <section className="mb-8 max-w-3xl rounded-xl border bg-white p-6">
        <div className="flex justify-between">
          <h2 className="font-semibold">GitHub connection</h2>
          <Badge variant="outline">{auth.data?.connected ? 'Connected' : 'Not connected'}</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Use the client ID of a GitHub App with Device Flow enabled. Install it on the repositories you want
          to observe. Authorization opens on GitHub; the token stays in your macOS Keychain.
        </p>
        <label className="mt-5 block text-xs font-medium" htmlFor="client-id">
          GitHub App client ID
        </label>
        <Input
          id="client-id"
          className="mt-2"
          placeholder={auth.data?.clientId || 'Iv1.…'}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        />
        <div className="mt-4 flex gap-3">
          <Button disabled={busy || Boolean(device)} onClick={() => void connect()}>
            Connect GitHub
          </Button>
          {auth.data?.connected && (
            <Button
              variant="outline"
              onClick={() => {
                void query('github_logout')
                  .then(() => client.invalidateQueries())
                  .catch((e) => setError(String(e)));
              }}
            >
              Disconnect
            </Button>
          )}
        </div>
        {device && (
          <div className="mt-5 rounded-lg bg-muted p-4">
            <p className="text-sm">Enter this code on GitHub:</p>
            <p className="my-3 font-mono text-2xl tracking-widest">{device.userCode}</p>
            <p className="text-xs text-muted-foreground">
              Waiting for authorization. The code expires after {Math.round(device.expiresIn / 60)} minutes.
            </p>
          </div>
        )}
      </section>
      {repo && (
        <section className="mb-8 max-w-3xl rounded-xl border bg-white p-6">
          <h2 className="font-semibold">Repository execution trust</h2>
          <p className="mt-3 font-mono text-xs text-muted-foreground">{repo.path}</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Nx plugins execute code from this repository. Trust enables local Nx and pnpm queries. Worklens
            never installs missing dependencies or starts build/test tasks from this screen.
          </p>
          <Button
            className="mt-4"
            variant={repo.trusted ? 'outline' : 'default'}
            onClick={() => void trust(!repo.trusted)}
          >
            {repo.trusted ? 'Revoke execution trust' : 'Trust this repository'}
          </Button>
        </section>
      )}
      <section className="max-w-3xl">
        <h2 className="mb-4 font-semibold">Tool diagnostics</h2>
        <div className="divide-y rounded-xl border bg-white">
          {doctor.data?.tools.map((tool) => (
            <div key={tool.tool} className="flex justify-between p-4 text-sm">
              <span>{tool.tool}</span>
              <span className={tool.available ? 'text-muted-foreground' : 'text-amber-800'}>
                {tool.version}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 font-mono text-xs text-muted-foreground">Data: {doctor.data?.dataDirectory}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Protocol {doctor.data?.protocol ?? 1} · Local alpha · No hosted Worklens service
        </p>
      </section>
    </>
  );
}
