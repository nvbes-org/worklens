import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Repository, ToolStatus } from '@worklens/contracts';
import { ArrowLeft, Folder, GitBranch, Info, Keyboard, Palette, Settings2 } from 'lucide-react';
import { type ReactNode, type RefObject, useState } from 'react';
import { ErrorNotice, Loading } from '../components/common';
import { Button } from '../components/ui/button';
import { query } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { useSession } from '../lib/session';

const categories = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'projects', label: 'Projects', icon: Folder },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'shortcuts', label: 'Keyboard shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
];
function PreferenceRow({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="preference-row">
      <div className="min-w-0">
        <h3 className="text-[13px] font-medium">{title}</h3>
        <div className="mt-1.5 text-xs leading-5 text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      className="preference-switch"
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function SettingsPage({
  active,
  onBack,
  backRef,
}: {
  active: boolean;
  onBack: () => void;
  backRef: RefObject<HTMLButtonElement | null>;
}) {
  const { repo, setRepo } = useSession();
  const { preferences, update, storageError } = usePreferences();
  const client = useQueryClient();
  const [category, setCategory] = useState('general');
  const [error, setError] = useState('');
  const [trustBusy, setTrustBusy] = useState(false);
  const doctor = useQuery({
    queryKey: ['doctor'],
    queryFn: () => query<{ tools: ToolStatus[]; dataDirectory: string; protocol: number }>('doctor'),
    enabled: active,
  });
  async function trust(trusted: boolean) {
    if (!repo) return;
    setTrustBusy(true);
    setError('');
    try {
      setRepo(await query<Repository>('trust', repo.path, { trusted }));
      await client.invalidateQueries({ queryKey: ['graph'] });
    } catch (e) {
      setError(String(e));
    } finally {
      setTrustBusy(false);
    }
  }
  const heading = categories.find((item) => item.id === category)?.label ?? 'General';
  return (
    <div className="settings-layout">
      <header className="settings-header">
        <Button ref={backRef} variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back to project
        </Button>
      </header>
      <aside className="settings-categories">
        <p className="mb-6 px-3 text-xl font-semibold tracking-tight">Settings</p>
        <nav aria-label="Settings categories">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCategory(item.id)}
              aria-current={category === item.id ? 'page' : undefined}
              className={category === item.id ? 'selected' : ''}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="settings-content" aria-label="Settings">
        <h1 className="text-[28px] font-semibold tracking-[-0.035em]">{heading}</h1>
        <p className="mt-2 mb-8 text-[13px] text-muted-foreground">Make Worklens feel like your workspace.</p>
        <ErrorNotice error={error || storageError || doctor.error} />
        {category === 'general' && (
          <>
            <h2 className="settings-section-label">Your workspace</h2>
            <div className="preference-group">
              <PreferenceRow title="Start page" description="The page shown when you open a project.">
                <select
                  aria-label="Start page"
                  className="preference-select"
                  value={preferences.startView}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'overview' || value === 'architecture' || value === 'git')
                      update({ startView: value });
                  }}
                >
                  <option value="overview">Overview</option>
                  <option value="architecture">Architecture</option>
                  <option value="git">Git</option>
                </select>
              </PreferenceRow>
              <PreferenceRow title="Sidebar" description="Keep the project sidebar collapsed by default.">
                <Switch
                  label="Keep sidebar collapsed"
                  checked={preferences.sidebarCollapsed}
                  onChange={(sidebarCollapsed) => update({ sidebarCollapsed })}
                />
              </PreferenceRow>
              <PreferenceRow title="Language" description="Worklens currently uses English.">
                <span className="text-xs text-muted-foreground">English</span>
              </PreferenceRow>
            </div>
            <h2 className="settings-section-label mt-8">Local data</h2>
            <div className="preference-group">
              <PreferenceRow
                title="Data directory"
                description={
                  <span className="break-all font-mono text-[11px]">
                    {doctor.data?.dataDirectory ?? (doctor.isPending ? 'Loading…' : 'Unavailable')}
                  </span>
                }
              >
                <span className="text-[11px] text-muted-foreground">On this device</span>
              </PreferenceRow>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              Preferences are saved automatically on this device.
            </p>
          </>
        )}
        {category === 'appearance' && (
          <div className="preference-group">
            <PreferenceRow
              title="Appearance"
              description="A light workspace with a soft, translucent sidebar."
            >
              <span className="text-xs text-muted-foreground">Light</span>
            </PreferenceRow>
            <PreferenceRow
              title="Reduce motion"
              description="Show panels immediately. System reduced-motion preferences are always respected."
            >
              <Switch
                label="Reduce motion"
                checked={preferences.reduceMotion}
                onChange={(reduceMotion) => update({ reduceMotion })}
              />
            </PreferenceRow>
            <PreferenceRow
              title="Compact rows"
              description="Fit more files and components in your workspace."
            >
              <Switch
                label="Compact rows"
                checked={preferences.compact}
                onChange={(compact) => update({ compact })}
              />
            </PreferenceRow>
          </div>
        )}
        {category === 'projects' &&
          (repo ? (
            <div className="preference-group">
              <PreferenceRow
                title={repo.name}
                description={<span className="break-all font-mono text-[11px]">{repo.path}</span>}
              >
                <Folder className="size-4 text-muted-foreground" />
              </PreferenceRow>
              <PreferenceRow
                title="Repository execution trust"
                description="Allow Nx and pnpm queries in this repository. Nx plugins can execute repository code."
              >
                <Button
                  size="sm"
                  variant={repo.trusted ? 'outline' : 'default'}
                  disabled={trustBusy}
                  onClick={() => void trust(!repo.trusted)}
                >
                  {repo.trusted ? 'Revoke execution trust' : 'Trust this repository'}
                </Button>
              </PreferenceRow>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Open a project to manage its trust settings.</p>
          ))}
        {category === 'git' && (
          <div className="preference-group">
            <PreferenceRow
              title="Repository operations"
              description="Changes, diffs, branches and history are inspected locally."
            >
              <span className="text-xs text-muted-foreground">Read-only</span>
            </PreferenceRow>
            <PreferenceRow
              title="Remote references"
              description="Worklens displays the last known remote state. Refresh does not fetch."
            >
              <span className="text-xs text-muted-foreground">Local references</span>
            </PreferenceRow>
            <PreferenceRow
              title="Stage, commit and sync"
              description="Use your editor or terminal for Git write operations."
            >
              <span className="text-xs text-muted-foreground">Not available yet</span>
            </PreferenceRow>
          </div>
        )}
        {category === 'shortcuts' && (
          <div className="preference-group">
            <PreferenceRow title="Search project" description="Find components and documents.">
              <kbd className="shortcut-key">⌘ / Ctrl K</kbd>
            </PreferenceRow>
            <PreferenceRow
              title="Return to project"
              description="Close Settings and return to your previous screen."
            >
              <kbd className="shortcut-key">Esc</kbd>
            </PreferenceRow>
            <PreferenceRow title="Navigate controls" description="Move between interactive controls.">
              <kbd className="shortcut-key">Tab / Shift Tab</kbd>
            </PreferenceRow>
          </div>
        )}
        {category === 'about' && (
          <>
            <div className="preference-group">
              <PreferenceRow title="Worklens" description="Your monorepo, in one local workspace.">
                <span className="text-xs text-muted-foreground">0.1.0-alpha.1</span>
              </PreferenceRow>
            </div>
            <h2 className="settings-section-label mt-8">Tool diagnostics</h2>
            {doctor.isPending && <Loading />}
            <div className="preference-group">
              {doctor.data?.tools.map((tool) => (
                <PreferenceRow key={tool.tool} title={tool.tool} description={tool.version}>
                  <span className={tool.available ? 'text-xs text-emerald-700' : 'text-xs text-amber-700'}>
                    {tool.available ? 'Available' : 'Unavailable'}
                  </span>
                </PreferenceRow>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Protocol {doctor.data?.protocol ?? '—'} · Local alpha · No hosted Worklens service
            </p>
          </>
        )}
      </main>
    </div>
  );
}
