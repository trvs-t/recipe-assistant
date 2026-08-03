import type { LabelHTMLAttributes, ReactElement } from 'react';

import { cn } from '@/lib/cn';

export interface ILabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

export function Label({ className, ...props }: ILabelProps): ReactElement {
  return <label className={cn('text-sm font-semibold text-[var(--foreground)]', className)} {...props} />;
}
