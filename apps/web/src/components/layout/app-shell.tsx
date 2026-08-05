import { useState, type ReactElement, type ReactNode } from 'react';

import { ChevronRight, CookingPot, Menu, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { useLocalAuthenticatedEmail } from '@/components/auth/local-auth-gate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { supabaseAdapter } from '@/lib/supabase';

type NavHref = '/' | '/import';

interface INavItem {
  to: NavHref;
  label: string;
}

export interface IAppShellProps {
  children: ReactNode;
}

const navItems: INavItem[] = [
  { to: '/', label: 'Library' },
  { to: '/import', label: 'Import recipe' },
];

export function AppShell({ children }: IAppShellProps): ReactElement {
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const authenticatedEmail: string | null = useLocalAuthenticatedEmail();

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[color:var(--background)/.9] backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link
            className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            to="/"
            onClick={(): void => setMobileMenuOpen(false)}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm transition-transform group-hover:-rotate-3">
              <CookingPot size={21} strokeWidth={2.2} />
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">Recipe Collector</span>
          </Link>

          <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
            {navItems.map((item: INavItem): ReactElement => (
              <Link
                activeProps={{ className: 'bg-[var(--muted)] text-[var(--foreground)]' }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                key={item.to}
                to={item.to}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Badge className="hidden sm:inline-flex" variant={supabaseAdapter.mode === 'demo' ? 'warning' : 'success'}>
              {supabaseAdapter.mode === 'demo'
                ? 'Demo data'
                : authenticatedEmail === null
                  ? 'Connected'
                  : `Connected as ${authenticatedEmail}`}
            </Badge>
            <Link className="hidden md:block" to="/import">
              <Button size="sm">
                Add a recipe
                <ChevronRight size={16} />
              </Button>
            </Link>
            <Button
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              className="md:hidden"
              onClick={(): void => setMobileMenuOpen((open: boolean): boolean => !open)}
              size="icon"
              variant="ghost"
            >
              {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
            </Button>
          </div>
        </div>

        {mobileMenuOpen ? (
          <nav aria-label="Mobile navigation" className="border-t border-[var(--border)] px-5 py-3 md:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              {navItems.map((item: INavItem): ReactElement => (
                <Link
                  activeProps={{ className: 'bg-[var(--muted)] text-[var(--foreground)]' }}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                  key={item.to}
                  onClick={(): void => setMobileMenuOpen(false)}
                  to={item.to}
                >
                  {item.label}
                </Link>
              ))}
              <Link className="mt-2" onClick={(): void => setMobileMenuOpen(false)} to="/import">
                <Button className="w-full" size="sm">
                  Add a recipe
                  <ChevronRight size={16} />
                </Button>
              </Link>
            </div>
          </nav>
        ) : null}
      </header>

      <main className={cn('mx-auto min-h-[calc(100vh-9rem)] max-w-7xl px-5 py-8 sm:px-8 sm:py-10 lg:px-10')}>
        {children}
      </main>

      <footer className="border-t border-[var(--border)] px-5 py-6 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 text-xs text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
          <span>Collect once. Cook with confidence.</span>
          <span>Recipe Collector web foundation</span>
        </div>
      </footer>
    </div>
  );
}
