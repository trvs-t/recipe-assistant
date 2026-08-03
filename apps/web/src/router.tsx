import { createRouter } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';

import { routeTree } from './routeTree.gen';

export interface IRouterContext {
  queryClient: QueryClient;
}

export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
