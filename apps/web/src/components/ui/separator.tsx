import type { HTMLAttributes, ReactElement } from 'react';

import { cn } from '@/lib/cn';

export interface ISeparatorProps extends HTMLAttributes<HTMLDivElement> {}

export function Separator({ className, ...props }: ISeparatorProps): ReactElement {
  return <div aria-hidden="true" className={cn('h-px w-full bg-[var(--border)]', className)} {...props} />;
}
