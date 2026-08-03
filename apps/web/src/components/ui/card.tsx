import type { HTMLAttributes, ReactElement } from 'react';

import { cn } from '@/lib/cn';

export interface ICardProps extends HTMLAttributes<HTMLDivElement> {}

export interface ICardTitleProps extends HTMLAttributes<HTMLHeadingElement> {}

export interface ICardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

export function Card({ className, ...props }: ICardProps): ReactElement {
  return (
    <div
      className={cn('rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-[var(--shadow-card)]', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ICardProps): ReactElement {
  return <div className={cn('flex flex-col gap-2 p-5 sm:p-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ICardTitleProps): ReactElement {
  return <h3 className={cn('font-display text-xl font-semibold tracking-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ICardDescriptionProps): ReactElement {
  return <p className={cn('text-sm leading-6 text-[var(--muted-foreground)]', className)} {...props} />;
}

export function CardContent({ className, ...props }: ICardProps): ReactElement {
  return <div className={cn('p-5 pt-0 sm:p-6 sm:pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ICardProps): ReactElement {
  return <div className={cn('flex items-center p-5 pt-0 sm:p-6 sm:pt-0', className)} {...props} />;
}
