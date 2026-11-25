import { Eye, EyeOff, Key, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { EnvironmentProfile } from '@worklens/contracts';

interface EnvProfilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: EnvironmentProfile[];
  onSaveProfile: (profile: EnvironmentProfile) => void;
  onDeleteProfile: (id: string) => void;
}

export function EnvProfilesModal({
  isOpen,
  onClose,
  profiles,
  onSaveProfile,
  onDeleteProfile,
}: EnvProfilesModalProps) {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    profiles[0]?.id || 'profile_dev',
  );
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const currentProfile =
    profiles.find((p) => p.id === selectedProfileId) || profiles[0];

  const handleAddVar = () => {
    if (!newKey.trim() || !currentProfile) return;
    const updated = {
      ...currentProfile,
      variables: {
        ...currentProfile.variables,
        [newKey.trim()]: newVal,
      },
    };
    onSaveProfile(updated);
    setNewKey('');
    setNewVal('');
  };

  const handleRemoveVar = (key: string) => {
    if (!currentProfile) return;
    const nextVars = { ...currentProfile.variables };
    delete nextVars[key];
    onSaveProfile({
      ...currentProfile,
      variables: nextVars,
    });
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isSecret = (k: string) => {
    const l = k.toLowerCase();
    return (
      l.includes('key') ||
      l.includes('secret') ||
      l.includes('token') ||
      l.includes('password')
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-default)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Key className="size-5 text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Environments & Variable Injection
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Profile Tabs */}
        <div className="flex border-b border-[var(--border-subtle)] px-4 bg-[var(--surface-subtle)] gap-2 overflow-x-auto">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProfileId(p.id)}
              className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                selectedProfileId === p.id
                  ? 'border-[var(--accent)] text-[var(--text-primary)] font-semibold'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {currentProfile ? (
            <>
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)] pb-2 border-b border-[var(--border-subtle)]">
                <span>
                  Env file:{' '}
                  <span className="font-mono text-[var(--text-primary)]">
                    {currentProfile.envFilePath || 'None'}
                  </span>
                </span>
                <span>
                  Inherits host environment:{' '}
                  <span className="text-[var(--text-primary)]">
                    {currentProfile.inheritsHost ? 'Yes' : 'Isolated'}
                  </span>
                </span>
              </div>

              {/* Variables List */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                  Environment Variables ({Object.keys(currentProfile.variables).length})
                </h3>

                {Object.keys(currentProfile.variables).length === 0 ? (
                  <div className="text-center py-6 text-xs text-[var(--text-muted)]">
                    No custom variables in this profile. Add one below!
                  </div>
                ) : (
                  Object.entries(currentProfile.variables).map(([k, v]) => {
                    const secret = isSecret(k);
                    const revealed = revealedKeys.has(k);

                    return (
                      <div
                        key={k}
                        className="flex items-center justify-between p-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-xs font-mono"
                      >
                        <span className="font-semibold text-[var(--text-primary)] min-w-[140px] truncate">
                          {k}
                        </span>
                        <span className="flex-1 px-3 text-[var(--text-secondary)] truncate">
                          {secret && !revealed ? '••••••••••••••••' : v}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {secret && (
                            <button
                              type="button"
                              onClick={() => toggleReveal(k)}
                              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                              title={revealed ? 'Mask secret' : 'Reveal secret'}
                            >
                              {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveVar(k)}
                            className="p-1 rounded text-[var(--text-muted)] hover:text-red-400"
                            title="Remove variable"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add New Variable Form */}
              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <h4 className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
                  Add Variable Override
                </h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="VARIABLE_NAME"
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <input
                    type="text"
                    value={newVal}
                    onChange={(e) => setNewVal(e.target.value)}
                    placeholder="value"
                    className="flex-1 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    onClick={handleAddVar}
                    disabled={!newKey.trim()}
                    className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-30 font-medium flex items-center gap-1 shadow-sm"
                  >
                    <Plus className="size-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-xs text-[var(--text-muted)]">
              No profiles available.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg bg-[var(--surface-active)] text-[var(--text-primary)] font-medium hover:bg-[var(--border-subtle)] transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
