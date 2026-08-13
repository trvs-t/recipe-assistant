import type { FormEvent, HTMLAttributes, ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/cn';

interface IGoogleLoginFormProps extends HTMLAttributes<HTMLDivElement> {
  error: string | null;
  pending: boolean;
  onSignIn(): Promise<void>;
}

/**
 * Vite adaptation of Supabase UI's shadcn-compatible Social Authentication block.
 * The upstream block defaults to GitHub; Recipe Assistant intentionally offers Google only.
 */
export function GoogleLoginForm({
  className,
  error,
  onSignIn,
  pending,
  ...props
}: IGoogleLoginFormProps): ReactElement {
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void onSignIn();
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
            Recipe Collector
          </p>
          <CardTitle className="text-3xl">Welcome!</CardTitle>
          <CardDescription>
            Sign in with Google to keep your recipe library private and available across devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              {error !== null ? (
                <p className="text-sm text-[var(--destructive)]" role="alert">
                  {error}
                </p>
              ) : null}
              <Button className="w-full" disabled={pending} type="submit">
                {pending ? 'Connecting…' : 'Continue with Google'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
