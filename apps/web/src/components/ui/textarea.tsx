import type { ReactElement, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

export interface ITextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: ITextareaProps): ReactElement {
  return (
    <textarea
      className={cn(
        'flex min-h-28 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus-visible:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--primary-soft)] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
