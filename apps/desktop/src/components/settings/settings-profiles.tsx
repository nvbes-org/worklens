import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConfigProfile } from '@worklens/contracts';
import { Check, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { PreferenceRow, SettingsSection } from './settings-common';
import { SettingsProfileNetwork } from './settings-profile-network';

function defaultProfile(id: string): ConfigProfile {
  return {
    id,
    name: 'New Custom Profile',
    description: 'Custom network, TLS and transport configuration',
    isActive: false,
    network: {
      tls: {
        mode: 'disabled',
        minVersion: '1.3',
        caCertPath: null,
        clientCertPath: null,
        clientKeyPath: null,
        pinnedFingerprints: [],
      },
      proxy: { enabled: false, url: null, authKeychainKey: null, noProxy: [] },
      vpn: {
        enabled: false,
        mode: 'none',
        endpoint: null,
        interface: null,
        routedSubnets: [],
        authKeychainKey: null,
      },
      headers: {},
    },
    transports: {
      sockEnabled: true,
      pipeEnabled: true,
      apiEnabled: false,
      apiPort: 4040,
      apiBind: '127.0.0.1',
      mcpEnabled: true,
      mcpTransport: 'stdio',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function SettingsProfiles() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConfigProfile | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: profiles = [] } = useQuery({
    queryKey: ['config_profiles'],
    queryFn: () => query<ConfigProfile[]>('config_profile_list'),
  });

  const activeProfile = profiles.find((p) => p.isActive);
  const current = draft || profiles.find((p) => p.id === (selectedId || activeProfile?.id));

  const saveMutation = useMutation({
    mutationFn: (p: ConfigProfile) => query<{ saved: boolean }>('config_profile_save', null, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config_profiles'] });
      qc.invalidateQueries({ queryKey: ['transports_status'] });
      setMsg('Profile saved successfully.');
      setTimeout(() => setMsg(null), 3000);
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => query<ConfigProfile>('config_profile_activate', null, { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config_profiles'] });
      qc.invalidateQueries({ queryKey: ['transports_status'] });
      setMsg('Active profile changed.');
      setTimeout(() => setMsg(null), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => query<{ deleted: boolean }>('config_profile_delete', null, { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config_profiles'] });
      setSelectedId(null);
      setDraft(null);
    },
  });

  function updateDraft<K extends keyof ConfigProfile>(key: K, val: ConfigProfile[K]) {
    if (!current) return;
    setDraft({ ...current, [key]: val });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/20 p-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <span className="text-sm font-semibold">Active Profile: {activeProfile?.name ?? 'None'}</span>
            <Badge variant="outline" className="border-emerald-600/30 text-emerald-600">
              Active
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeProfile?.description || 'Active runtime profile'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const id = `profile_${Date.now()}`;
              const p = defaultProfile(id);
              setDraft(p);
              setSelectedId(id);
            }}
          >
            <Plus className="mr-1.5 size-3.5" />
            New Profile
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setSelectedId(p.id);
              setDraft(null);
            }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              current?.id === p.id
                ? 'border-primary bg-primary/5 text-primary font-semibold'
                : 'border-border hover:bg-muted/30 text-foreground'
            }`}
          >
            <span>{p.name}</span>
            {p.isActive && <span className="size-1.5 rounded-full bg-emerald-500" />}
          </button>
        ))}
      </div>

      {current && (
        <div className="space-y-6">
          <SettingsSection
            title="Profile Metadata"
            description="Identification and activation state of this configuration profile"
            action={
              <div className="flex items-center gap-2">
                {!current.isActive && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => activateMutation.mutate(current.id)}
                    disabled={activateMutation.isPending}
                  >
                    <Check className="mr-1.5 size-3.5" />
                    Set Active
                  </Button>
                )}
                {!current.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => deleteMutation.mutate(current.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => current && saveMutation.mutate(current)}
                  disabled={saveMutation.isPending}
                >
                  <Save className="mr-1.5 size-3.5" />
                  Save
                </Button>
              </div>
            }
          >
            <PreferenceRow title="Profile Name" description="Human-readable label for this profile.">
              <Input
                className="w-64"
                value={current.name}
                onChange={(e) => updateDraft('name', e.target.value)}
              />
            </PreferenceRow>
            <PreferenceRow title="Description" description="Purpose of this security profile.">
              <Input
                className="w-80"
                value={current.description ?? ''}
                onChange={(e) => updateDraft('description', e.target.value || null)}
              />
            </PreferenceRow>
          </SettingsSection>

          <SettingsProfileNetwork current={current} onUpdateDraft={updateDraft} />
        </div>
      )}

      {msg && (
        <div className="rounded-lg bg-emerald-500/10 p-3 text-xs font-medium text-emerald-600">{msg}</div>
      )}
    </div>
  );
}
