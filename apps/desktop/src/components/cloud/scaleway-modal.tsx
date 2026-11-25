import { CheckCircle2, Eye, EyeOff, Key, Lock, LogOut, RefreshCw, Shield, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getScalewayAuthStatus, logoutScaleway, setScalewayAuth } from '../../lib/cloud-api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface ScalewayModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ScalewayModal({ open, onClose, onSuccess }: ScalewayModalProps) {
  const [secretKey, setSecretKey] = useState('');
  const [projectId, setProjectId] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<{ connected: boolean; source: string; projectId?: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      void getScalewayAuthStatus().then((s) => {
        setStatus(s);
        if (s.projectId) setProjectId(s.projectId);
      });
    }
  }, [open]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretKey.trim()) {
      setError('Veuillez saisir votre clé secrète Scaleway.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setScalewayAuth(secretKey, projectId.trim() || undefined);
      const newStatus = await getScalewayAuthStatus();
      setStatus(newStatus);
      setSecretKey('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setError(null);
    try {
      await logoutScaleway();
      const newStatus = await getScalewayAuthStatus();
      setStatus(newStatus);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Key className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">API Scaleway Live</h3>
              <p className="text-xs text-muted-foreground">
                Synchronisation directe avec vos ressources Scaleway
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
            <X className="size-4" />
          </Button>
        </div>

        {/* Current Connection Status */}
        {status?.connected ? (
          <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-emerald-500 font-semibold">
                <CheckCircle2 className="size-4" />
                API Scaleway Connectée
              </div>
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              >
                Source : {status.source === 'keychain' ? 'Trousseau macOS' : 'Variable SCW_SECRET_KEY'}
              </Badge>
            </div>
            {status.projectId && (
              <p className="text-muted-foreground font-mono text-[11px] truncate">
                Project ID : {status.projectId}
              </p>
            )}
            <div className="pt-2 flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleLogout}
                disabled={busy}
                className="h-7 text-xs gap-1"
              >
                <LogOut className="size-3" /> Déconnecter la clé
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-3.5 text-xs">
            <div className="p-2.5 rounded-lg border border-border bg-muted/40 text-[11px] text-muted-foreground flex items-start gap-2">
              <Shield className="size-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                Votre clé secrète est stockée de manière chiffrée dans votre{' '}
                <strong>Trousseau d'accès macOS</strong> (OS Keychain) et n'est jamais sauvegardée en base
                locale.
              </span>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="scw-secret"
                className="font-medium text-foreground flex items-center justify-between"
              >
                <span>Scaleway Secret Key</span>
                <span className="text-[10px] text-muted-foreground font-mono">SCW_SECRET_KEY</span>
              </label>
              <div className="relative">
                <Input
                  id="scw-secret"
                  type={showKey ? 'text' : 'password'}
                  placeholder="ex: 11111111-2222-3333-4444-555555555555"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="h-8 text-xs font-mono pr-8 bg-background"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="scw-project"
                className="font-medium text-foreground flex items-center justify-between"
              >
                <span>Scaleway Project ID (optionnel)</span>
                <span className="text-[10px] text-muted-foreground font-mono">SCW_DEFAULT_PROJECT_ID</span>
              </label>
              <Input
                id="scw-project"
                type="text"
                placeholder="ex: aaaa-bbbb-cccc-dddd"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="h-8 text-xs font-mono bg-background"
              />
            </div>

            {error && (
              <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[11px]">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
                Annuler
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={busy}
                className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1"
              >
                {busy ? <RefreshCw className="size-3 animate-spin" /> : <Lock className="size-3" />}
                Connecter et Sécuriser
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
