import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { LocalAuthGate } from '@/components/auth/local-auth-gate';
import { queryClient } from '@/lib/query-client';

import { router } from './router';
import './styles.css';

const rootElement: HTMLElement | null = document.getElementById('root');

if (rootElement === null) {
  throw new Error('The web app root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <LocalAuthGate>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </LocalAuthGate>
  </StrictMode>,
);
