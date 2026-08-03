import type { ReactElement } from 'react';

import { Check, ChefHat, ListChecks, Sparkles } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface IRecipeFlowProps {
  compact?: boolean;
}

interface IFlowNode {
  label: string;
  detail: string;
  icon: ReactElement;
}

const flowNodes: IFlowNode[] = [
  { label: 'Source', detail: 'URL captured', icon: <Sparkles size={17} /> },
  { label: 'Structure', detail: 'Ingredients mapped', icon: <ListChecks size={17} /> },
  { label: 'Cook', detail: 'Steps ready', icon: <ChefHat size={17} /> },
];

export function RecipeFlow({ compact = false }: IRecipeFlowProps): ReactElement {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-stretch', compact ? 'sm:gap-2' : 'sm:gap-0')}>
      {flowNodes.map((node: IFlowNode, index: number): ReactElement => (
        <div className="flex flex-1 items-center sm:items-stretch" key={node.label}>
          <div
            className={cn(
              'flex flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3',
              compact ? 'sm:px-3 sm:py-2' : 'sm:flex-col sm:items-start sm:gap-6 sm:px-5 sm:py-4',
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
              {node.icon}
            </span>
            <span className={cn('min-w-0', compact ? '' : 'sm:space-y-1')}>
              <span className="block text-sm font-semibold">{node.label}</span>
              <span className="block text-xs text-[var(--muted-foreground)]">{node.detail}</span>
            </span>
            {!compact && index === flowNodes.length - 1 ? (
              <span className="ml-auto hidden text-[var(--success)] sm:block">
                <Check size={18} />
              </span>
            ) : null}
          </div>
          {index < flowNodes.length - 1 ? (
            <span aria-hidden="true" className="mx-2 hidden w-5 items-center sm:flex">
              <span className="h-px w-full bg-[var(--border-strong)]" />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
