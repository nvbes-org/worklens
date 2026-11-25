import { lazy, Suspense } from 'react';
import { Loading } from '../components/common';
import { Overview } from '../pages/overview';

const Architecture = lazy(() =>
  import('../pages/architecture').then((module) => ({ default: module.ArchitecturePage })),
);
const Git = lazy(() => import('../pages/git').then((module) => ({ default: module.GitPage })));
const Workspaces = lazy(() =>
  import('../pages/workspaces').then((module) => ({ default: module.WorkspacesPage })),
);
const Processes = lazy(() =>
  import('../pages/processes').then((module) => ({ default: module.ProcessesPage })),
);
const Engines = lazy(() =>
  import('../pages/engines').then((module) => ({ default: module.EnginesPage })),
);
const Cloud = lazy(() => import('../pages/cloud').then((module) => ({ default: module.CloudPage })));

export function WorkspaceView({ view }: { view: string }) {
  return (
    <Suspense fallback={<Loading />}>
      {view === 'architecture' ? (
        <Architecture />
      ) : view === 'cloud' ? (
        <Cloud />
      ) : view === 'git' ? (
        <Git />
      ) : view === 'workspaces' ? (
        <Workspaces />
      ) : view === 'processes' ? (
        <Processes />
      ) : view === 'engines' ? (
        <Engines />
      ) : (
        <Overview />
      )}
    </Suspense>
  );
}
