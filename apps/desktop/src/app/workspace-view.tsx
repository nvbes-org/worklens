import { lazy, Suspense } from 'react';
import { Loading } from '../components/common';
import { Overview } from '../pages/overview';

const Architecture = lazy(() =>
  import('../pages/architecture').then((module) => ({ default: module.ArchitecturePage })),
);
const Git = lazy(() => import('../pages/git').then((module) => ({ default: module.GitPage })));

export function WorkspaceView({ view }: { view: string }) {
  return (
    <Suspense fallback={<Loading />}>
      {view === 'architecture' ? <Architecture /> : view === 'git' ? <Git /> : <Overview />}
    </Suspense>
  );
}
