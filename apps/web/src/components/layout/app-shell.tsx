import type { ReactElement, ReactNode } from 'react';

import { CookingPot } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { useLocalAuthenticatedEmail } from '@/components/auth/local-auth-gate';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { supabaseAdapter } from '@/lib/supabase';

export interface IAppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: IAppShellProps): ReactElement {
  const authenticatedEmail: string | null = useLocalAuthenticatedEmail();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color:var(--background)/.9] backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link
            className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            to="/"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition-transform group-hover:-rotate-3">
              <CookingPot size={21} strokeWidth={2.2} />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">Recipe Collector</span>
          </Link>

          <div className="flex items-center">
            <Badge className="hidden sm:inline-flex" variant={supabaseAdapter.mode === 'demo' ? 'warning' : 'success'}>
              {supabaseAdapter.mode === 'demo'
                ? 'Demo data'
                : authenticatedEmail === null
                  ? 'Connected'
                  : `Connected as ${authenticatedEmail}`}
            </Badge>
          </div>
        </div>
      </header>

      <main className={cn('mx-auto min-h-[calc(100vh-9rem)] max-w-7xl px-5 py-8 sm:px-8 sm:py-10 lg:px-10')}>
        {children}
      </main>

      <footer className="border-t border-[var(--border)] px-5 py-6 text-center text-xs text-[var(--muted-foreground)] sm:px-8 lg:px-10">
        Recipe Collector
      </footer>
    </div>
  );
}
