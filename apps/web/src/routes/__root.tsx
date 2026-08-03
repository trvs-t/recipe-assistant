import type { ReactElement } from 'react';

import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

import { AppShell } from '@/components/layout/app-shell';

import type { IRouterContext } from '@/router';

export const Route = createRootRouteWithContext<IRouterContext>()({
  component: RootLayout,
});

function RootLayout(): ReactElement {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
