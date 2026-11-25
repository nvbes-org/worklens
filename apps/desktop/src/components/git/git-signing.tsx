import { useQuery } from '@tanstack/react-query';
import type { SigningStatus, SshKeyInfo } from '@worklens/contracts';
import { Check, Copy, Key, RefreshCw, Shield, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { query } from '../../lib/api';
import { useGit, useSession } from '../../lib/session';
import { Button } from '../ui/button';

export function GitSigning() {
  const { repo } = useSession();
  const _git = useGit();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('id_worklens_ed25519');
  const [newKeyEmail, setNewKeyEmail] = useState('');
  const [keyType, setKeyType] = useState('ed25519');
  const [autoSetSigning, setAutoSetSigning] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const signingQuery = useQuery({
    queryKey: ['git_signing_status', repo?.path],
    queryFn: () => query<SigningStatus>('git_action', repo?.path, { action: 'signing_status' }),
    enabled: Boolean(repo),
  });

  const sshKeysQuery = useQuery({
    queryKey: ['git_ssh_keys', repo?.path],
    queryFn: () => query<SshKeyInfo[]>('git_action', repo?.path, { action: 'ssh_keys_list' }),
    enabled: Boolean(repo),
  });

  const signing = signingQuery.data;
  const sshKeys = sshKeysQuery.data ?? [];

  async function handleToggleSigning(enable: boolean) {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, {
        action: 'signing_config',
        gpg_sign: enable,
      });
      setFeedback(`Commit signing ${enable ? 'enabled' : 'disabled'}.`);
      await signingQuery.refetch();
    } catch (e) {
      setFeedback(`Error configuring signing: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetFormat(format: string) {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, {
        action: 'signing_config',
        gpg_sign: signing?.gpgSign ?? false,
        format,
      });
      setFeedback(`Signing format set to ${format}.`);
      await signingQuery.refetch();
    } catch (e) {
      setFeedback(`Error setting format: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetSigningKey(keyPath: string) {
    if (!repo) return;
    setIsSubmitting(true);
    try {
      await query('git_action', repo.path, {
        action: 'signing_config',
        gpg_sign: true,
        format: 'ssh',
        signing_key: keyPath,
      });
      setFeedback(`Configured ${keyPath} as SSH signing key.`);
      await signingQuery.refetch();
      await sshKeysQuery.refetch();
    } catch (e) {
      setFeedback(`Error setting signing key: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGenerateKey() {
    if (!repo || !newKeyName.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await query<{
        success: boolean;
        publicKey: string;
        path: string;
      }>('git_action', repo.path, {
        action: 'ssh_key_generate',
        name: newKeyName.trim(),
        email: newKeyEmail.trim() || null,
        key_type: keyType,
        set_as_signing: autoSetSigning,
      });

      setFeedback(`SSH key generated at ${res.path}.`);
      await sshKeysQuery.refetch();
      await signingQuery.refetch();
    } catch (e) {
      setFeedback(`Error generating key: ${String(e)}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Top Banner: Signing Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div className="flex items-center gap-3">
          {signing?.gpgSign ? (
            <ShieldCheck className="size-6 text-emerald-500 shrink-0" />
          ) : (
            <Shield className="size-6 text-muted-foreground shrink-0" />
          )}
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Cryptographic Commit Signing
              {signing?.gpgSign ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 border border-emerald-500/20">
                  Active ({signing.format.toUpperCase()})
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground border">
                  Disabled
                </span>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              {signing?.signingKey ? (
                <span>
                  Key: <code className="font-mono text-foreground text-[11px]">{signing.signingKey}</code>
                </span>
              ) : (
                'No signing key configured. Commits are unsigned.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={signing?.gpgSign ? 'outline' : 'default'}
            onClick={() => void handleToggleSigning(!signing?.gpgSign)}
            disabled={isSubmitting}
          >
            {signing?.gpgSign ? 'Disable Signing' : 'Enable Signing'}
          </Button>
          <div className="flex rounded-lg border p-0.5 text-xs bg-muted/20">
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                signing?.format === 'ssh'
                  ? 'bg-background shadow-xs text-foreground'
                  : 'text-muted-foreground'
              }`}
              onClick={() => void handleSetFormat('ssh')}
            >
              SSH
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                signing?.format === 'openpgp'
                  ? 'bg-background shadow-xs text-foreground'
                  : 'text-muted-foreground'
              }`}
              onClick={() => void handleSetFormat('openpgp')}
            >
              GPG
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">{feedback}</div>
      )}

      {/* Generator */}
      <div className="rounded-xl border p-4 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" /> Internal SSH Key Generator
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label
              htmlFor="signing-key-name"
              className="block text-xs font-medium text-muted-foreground mb-1"
            >
              Key Name
            </label>
            <input
              id="signing-key-name"
              type="text"
              className="h-8 w-full rounded-lg border bg-background px-3 text-xs font-mono"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="id_worklens_ed25519"
            />
          </div>
          <div>
            <label
              htmlFor="signing-key-email"
              className="block text-xs font-medium text-muted-foreground mb-1"
            >
              Email / Comment
            </label>
            <input
              id="signing-key-email"
              type="text"
              className="h-8 w-full rounded-lg border bg-background px-3 text-xs"
              value={newKeyEmail}
              onChange={(e) => setNewKeyEmail(e.target.value)}
              placeholder={signing?.userEmail ?? 'you@example.com'}
            />
          </div>
          <div>
            <label
              htmlFor="signing-key-type"
              className="block text-xs font-medium text-muted-foreground mb-1"
            >
              Algorithm
            </label>
            <select
              id="signing-key-type"
              className="h-8 w-full rounded-lg border bg-background px-2.5 text-xs outline-none"
              value={keyType}
              onChange={(e) => setKeyType(e.target.value)}
            >
              <option value="ed25519">Ed25519 (Recommended, fast & modern)</option>
              <option value="rsa">RSA (4096 bits)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoSetSigning}
              onChange={(e) => setAutoSetSigning(e.target.checked)}
            />
            Configure automatically as Git commit signing key & add to SSH agent
          </label>
          <Button
            size="sm"
            onClick={() => void handleGenerateKey()}
            disabled={isSubmitting || !newKeyName.trim()}
          >
            <Key className="mr-1.5 size-3.5" /> Generate Key Pair
          </Button>
        </div>
      </div>

      {/* Available SSH keys in ~/.ssh */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Key className="size-3.5" /> System SSH Keys &amp; Agent Sync ({sshKeys.length})
          </h4>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void sshKeysQuery.refetch()}
            disabled={sshKeysQuery.isFetching}
          >
            <RefreshCw className={`size-3.5 ${sshKeysQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="rounded-lg border divide-y overflow-hidden max-h-72 overflow-y-auto">
          {sshKeys.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No public SSH keys found in ~/.ssh. Generate one above!
            </p>
          ) : (
            sshKeys.map((k) => (
              <div
                key={k.name}
                className="p-3 text-xs flex flex-wrap items-center justify-between gap-3 hover:bg-muted/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{k.name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                      {k.keyType}
                    </span>
                    {k.inAgent && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.2 text-[10px] font-medium text-emerald-600 border border-emerald-500/20">
                        In ssh-agent
                      </span>
                    )}
                    {k.isSigningKey && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.2 text-[10px] font-medium text-primary border border-primary/20">
                        Current Signing Key
                      </span>
                    )}
                  </div>
                  <p
                    className="mt-1 font-mono text-[11px] text-muted-foreground truncate"
                    title={k.fingerprint}
                  >
                    {k.fingerprint}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2.5"
                    onClick={() => copyToClipboard(k.publicKey, k.name)}
                  >
                    {copiedKey === k.name ? (
                      <>
                        <Check className="mr-1 size-3 text-emerald-500" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 size-3" /> Copy Public Key
                      </>
                    )}
                  </Button>

                  {!k.isSigningKey && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs px-2.5"
                      onClick={() => void handleSetSigningKey(k.path)}
                      disabled={isSubmitting}
                    >
                      <ShieldCheck className="mr-1 size-3" /> Use for Signing
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
