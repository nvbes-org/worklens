import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Shell } from '../components/shell';
import { TooltipProvider } from '../components/ui/tooltip';
import { PreferencesProvider } from '../lib/preferences';
import { SessionProvider } from '../lib/session';

const rootRoute = createRootRoute({ component: Shell });
const viewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/$view',
  validateSearch: (search: Record<string, unknown>): { workId?: string; reference?: string } => ({
    workId: typeof search.workId === 'string' ? search.workId : undefined,
    reference: typeof search.reference === 'string' ? search.reference : undefined,
  }),
});
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' });
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
        <PreferencesProvider>
          <TooltipProvider>
            <Suspense fallback={<p className="p-8 text-sm">Loading view…</p>}>
              <RouterProvider router={router} />
            </Suspense>
          </TooltipProvider>
        </PreferencesProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
