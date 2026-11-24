import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Activity, Boxes, Cloud, GitBranch, Layers, LayoutDashboard, Network, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { WorkspaceView } from '../app/workspace-view';
import { usePreferences } from '../lib/preferences';
import { useGit, useSession } from '../lib/session';
import { SettingsPage } from '../pages/settings';
import { ErrorNotice } from './common';
import { IslandButton, IslandGroup, IslandItem } from './ui/island';
import { Welcome } from './welcome';
import { WindowDockSlot, WindowManagerLayer } from './window-manager';
import { ProjectSwitcher, SidebarToggle, WorkspaceToolbar } from './workspace-toolbar';

const navigation = [
  { view: 'overview', label: 'Overview', icon: LayoutDashboard },
  { view: 'architecture', label: 'Architecture', icon: Network },
  { view: 'cloud', label: 'Cloud', icon: Cloud },
  { view: 'git', label: 'Git', icon: GitBranch },
  { view: 'processes', label: 'Processes', icon: Activity },
  { view: 'engines', label: 'Engines', icon: Boxes },
  { view: 'workspaces', label: 'Workspaces', icon: Layers },
];

export function Shell() {
  const { repo, error } = useSession();
  const git = useGit();
  const { preferences, update } = usePreferences();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const settingsOpen = pathname === '/settings';
  const requestedView =
    navigation.find((item) => pathname === `/${item.view}`)?.view ?? preferences.startView;
  const [lastView, setLastView] = useState(requestedView);
  const [switching, setSwitching] = useState(false);
  const backButton = useRef<HTMLButtonElement>(null);
  const wasSettingsOpen = useRef(false);
  const view = settingsOpen ? lastView : requestedView;

  useEffect(() => {
    if (!settingsOpen) setLastView(requestedView);
  }, [settingsOpen, requestedView]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b' && !event.defaultPrevented) {
        event.preventDefault();
        update({ sidebarCollapsed: !preferences.sidebarCollapsed });
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o' && !event.defaultPrevented) {
        event.preventDefault();
        setSwitching(true);
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [preferences.sidebarCollapsed, update]);

  useEffect(() => {
    if (settingsOpen) backButton.current?.focus({ preventScroll: true });
    else if (wasSettingsOpen.current) {
      const trigger = document.querySelector<HTMLAnchorElement>('.toolbar-layer a[aria-label="Settings"]');
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

  const isDark =
    preferences.theme === 'dark' ||
    (preferences.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div
      className="workspace-shell"
      data-settings={settingsOpen}
      data-collapsed={preferences.sidebarCollapsed}
      data-reduce-motion={preferences.reduceMotion}
      data-density={preferences.compact ? 'compact' : 'comfortable'}
      data-theme={isDark ? 'dark' : 'light'}
    >
      <div className="window-top-drag-region" data-tauri-drag-region />
      <div className="settings-surface" inert={!settingsOpen} aria-hidden={!settingsOpen}>
        <SettingsPage
          active={settingsOpen}
          backRef={backButton}
          onBack={() => void navigate({ to: '/$view', params: { view: lastView } })}
        />
      </div>
      <SidebarToggle
        collapsed={preferences.sidebarCollapsed}
        onToggle={() => update({ sidebarCollapsed: !preferences.sidebarCollapsed })}
      />
      <aside
        id="project-sidebar"
        aria-label="Project sidebar"
        className="project-sidebar select-none"
        inert={settingsOpen || preferences.sidebarCollapsed}
        aria-hidden={settingsOpen || preferences.sidebarCollapsed}
      >
        <div className="sidebar-drag-region" data-tauri-drag-region />

        {/* Top Header: Traffic Lights spacing + Search button */}
        <div className="sidebar-top-row" data-tauri-drag-region>
          <div className="sidebar-traffic-spacer" data-tauri-drag-region />
          <div className="sidebar-top-actions">
            <IslandButton
              size="icon-sm"
              onClick={() => {
                window.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
                );
              }}
              aria-label="Filter"
              title="Search project (⌘K)"
            >
              <Search className="size-3.5" />
            </IslandButton>
          </div>
        </div>

        {/* Workspace Branch Section */}
        {repo && git.data?.branch && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Workspace</div>
            <div className="sidebar-branch-row">
              <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1 text-[12px] text-muted-foreground font-medium">
                {git.data.branch}
              </span>
              <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
            </div>
          </div>
        )}
      </aside>
      <div className="main-screen" inert={settingsOpen} aria-hidden={settingsOpen}>
        <main className="workspace-content" id="main-content">
          {repo && <ErrorNotice error={error} />}
          {view === 'workspaces' ? (
            <WorkspaceView key="workspaces" view="workspaces" />
          ) : repo ? (
            <WorkspaceView key={repo.path} view={view} />
          ) : (
            <Welcome />
          )}
          <WindowDockSlot name="main" className="dock-slot-main mt-3" />
        </main>
      </div>
      <div className="toolbar-layer" inert={settingsOpen} aria-hidden={settingsOpen}>
        <WorkspaceToolbar />
      </div>
      {(repo || view === 'workspaces') && (
        <IslandGroup asChild className="navigation-island">
          <nav aria-label="Main navigation" inert={settingsOpen} aria-hidden={settingsOpen}>
            {navigation.map((item) => {
              const isActive = view === item.view;
              return (
                <IslandItem key={item.view} active={isActive} asChild>
                  <Link to="/$view" params={{ view: item.view }} aria-current={isActive ? 'page' : undefined}>
                    <item.icon className="size-4 shrink-0" strokeWidth={isActive ? 2 : 1.75} />
                    <span className="island-label">{item.label}</span>
                  </Link>
                </IslandItem>
              );
            })}
          </nav>
        </IslandGroup>
      )}
      <WindowManagerLayer />
      <ProjectSwitcher open={switching} onOpenChange={setSwitching} />
    </div>
  );
}
