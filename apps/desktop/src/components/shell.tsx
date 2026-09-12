import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { ChevronDown, GitBranch, LayoutDashboard, Network, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { WorkspaceView } from '../app/workspace-view';
import { usePreferences } from '../lib/preferences';
import { useSession } from '../lib/session';
import { SettingsPage } from '../pages/settings';
import { ErrorNotice } from './common';
import { Welcome } from './welcome';
import { ProjectSwitcher, WorkspaceToolbar } from './workspace-toolbar';

const navigation = [
  { view: 'overview', label: 'Overview', icon: LayoutDashboard },
  { view: 'architecture', label: 'Architecture', icon: Network },
  { view: 'git', label: 'Git', icon: GitBranch },
];

export function Shell() {
  const { repo, error } = useSession();
  const { preferences, update } = usePreferences();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const settingsOpen = pathname === '/settings';
  const requestedView =
    navigation.find((item) => pathname === `/${item.view}`)?.view ?? preferences.startView;
  const [lastView, setLastView] = useState(requestedView);
  const [switching, setSwitching] = useState(false);
  const settingsButton = useRef<HTMLAnchorElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const wasSettingsOpen = useRef(false);
  const view = settingsOpen ? lastView : requestedView;

  useEffect(() => {
    if (!settingsOpen) setLastView(requestedView);
  }, [settingsOpen, requestedView]);

  useEffect(() => {
    if (settingsOpen) backButton.current?.focus({ preventScroll: true });
    else if (wasSettingsOpen.current) {
      const trigger = settingsButton.current?.closest('[inert]')
        ? document.querySelector<HTMLAnchorElement>('.toolbar-layer a[aria-label="Settings"]')
        : settingsButton.current;
      trigger?.focus({ preventScroll: true });
    }
    wasSettingsOpen.current = settingsOpen;
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') void navigate({ to: '/$view', params: { view: lastView } });
    }
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [settingsOpen, lastView, navigate]);

  return (
    <div
      className="workspace-shell"
      data-settings={settingsOpen}
      data-collapsed={preferences.sidebarCollapsed}
      data-reduce-motion={preferences.reduceMotion}
      data-density={preferences.compact ? 'compact' : 'comfortable'}
    >
      <div className="settings-surface" inert={!settingsOpen} aria-hidden={!settingsOpen}>
        <SettingsPage
          active={settingsOpen}
          backRef={backButton}
          onBack={() => void navigate({ to: '/$view', params: { view: lastView } })}
        />
      </div>
      <aside
        id="project-sidebar"
        aria-label="Project sidebar"
        className="project-sidebar"
        inert={settingsOpen || preferences.sidebarCollapsed}
        aria-hidden={settingsOpen || preferences.sidebarCollapsed}
      >
        <button
          type="button"
          className="project-switcher"
          onClick={() => setSwitching(true)}
          aria-label="Change project"
        >
          <span className="project-avatar">{repo?.name.charAt(0).toUpperCase() ?? 'W'}</span>
          <span className="truncate font-semibold">{repo?.name ?? 'Worklens'}</span>
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
        {repo && (
          <p className="sidebar-path" title={repo.path}>
            {repo.path}
          </p>
        )}
        <div className="mt-auto space-y-4">
          <Link ref={settingsButton} to="/$view" params={{ view: 'settings' }} className="sidebar-settings">
            <Settings className="size-4" />
            Settings
          </Link>
          <p className="flex items-center gap-2 px-3 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Local workspace
          </p>
        </div>
      </aside>
      <div className="main-screen" inert={settingsOpen} aria-hidden={settingsOpen}>
        <main className="workspace-content" id="main-content">
          {repo && <ErrorNotice error={error} />}
          {repo ? <WorkspaceView key={repo.path} view={view} /> : <Welcome />}
        </main>
      </div>
      <div className="toolbar-layer" inert={settingsOpen} aria-hidden={settingsOpen}>
        <WorkspaceToolbar
          collapsed={preferences.sidebarCollapsed}
          onToggle={() => update({ sidebarCollapsed: !preferences.sidebarCollapsed })}
        />
      </div>
      <nav
        aria-label="Main navigation"
        className="navigation-island"
        inert={settingsOpen}
        aria-hidden={settingsOpen}
      >
        {navigation.map((item) => (
          <Link
            key={item.view}
            to="/$view"
            params={{ view: item.view }}
            aria-current={view === item.view ? 'page' : undefined}
            className={`island-item ${view === item.view ? 'is-active' : ''}`}
          >
            <item.icon className="size-[18px]" />
            {item.label}
          </Link>
        ))}
      </nav>
      <ProjectSwitcher open={switching} onOpenChange={setSwitching} />
    </div>
  );
}
