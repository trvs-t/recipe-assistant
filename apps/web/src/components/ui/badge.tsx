import type { HTMLAttributes, ReactElement } from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-[var(--primary-soft)] text-[var(--primary)]',
        secondary: 'border-transparent bg-[var(--muted)] text-[var(--muted-foreground)]',
        outline: 'border-[var(--border)] text-[var(--muted-foreground)]',
        success: 'border-transparent bg-[var(--success-soft)] text-[var(--success)]',
        warning: 'border-transparent bg-[var(--warning-soft)] text-[var(--warning)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface IBadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: IBadgeProps): ReactElement {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
