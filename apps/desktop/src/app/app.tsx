import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { Shell } from '../components/shell';
import { TooltipProvider } from '../components/ui/tooltip';
import { SessionProvider } from '../lib/session';
import { AgentsPage } from '../pages/agents';
import { Overview } from '../pages/overview';
import { SettingsPage } from '../pages/settings';

const ArchitecturePage = lazy(() =>
  import('../pages/architecture').then((m) => ({ default: m.ArchitecturePage })),
);
const DocumentsPage = lazy(() => import('../pages/documents').then((m) => ({ default: m.DocumentsPage })));
const GitPage = lazy(() => import('../pages/git').then((m) => ({ default: m.GitPage })));
const GithubPage = lazy(() => import('../pages/github').then((m) => ({ default: m.GithubPage })));
const WorkPage = lazy(() => import('../pages/work').then((m) => ({ default: m.WorkPage })));

function View() {
  const { view } = viewRoute.useParams();
  switch (view) {
    case 'work':
      return <WorkPage />;
    case 'architecture':
      return <ArchitecturePage />;
    case 'git':
      return <GitPage />;
    case 'pull-requests':
      return <GithubPage key="prs" kind="prs" />;
    case 'issues':
      return <GithubPage key="issues" kind="issues" />;
    case 'ci':
      return <GithubPage key="ci" kind="ci" />;
    case 'agents':
      return <AgentsPage />;
    case 'documents':
      return <DocumentsPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <Overview />;
  }
}
const rootRoute = createRootRoute({ component: Shell });
const viewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$view',
  component: View,
  validateSearch: (search: Record<string, unknown>): { workId?: string; reference?: string } => ({
    workId: typeof search.workId === 'string' ? search.workId : undefined,
    reference: typeof search.reference === 'string' ? search.reference : undefined,
  }),
});
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Overview });
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, viewRoute]) });
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: true } },
});
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <TooltipProvider>
          <Suspense fallback={<p className="p-8 text-sm">Loading view…</p>}>
            <RouterProvider router={router} />
          </Suspense>
        </TooltipProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
