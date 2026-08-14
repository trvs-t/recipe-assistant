import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDuration } from '@/lib/format';

import type { IRecipeStep } from '@/features/recipes/contracts';

export interface IRecipeInstructionsProps {
  steps: readonly IRecipeStep[];
}

export function RecipeInstructions({ steps }: IRecipeInstructionsProps): ReactElement {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--border)] bg-[var(--card-muted)]">
        <CardTitle>Instructions</CardTitle>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        {steps.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">No instructions were provided for this recipe.</p>
        ) : (
          <ol aria-label="Ordered recipe steps" className="list-decimal space-y-5 pl-5 text-sm">
            {steps.map((step: IRecipeStep): ReactElement => {
              const showTitle: boolean = !/^step\s+\d+$/i.test(step.title.trim());

              return (
                <li className="pl-1" key={step.id}>
                  {showTitle || step.durationMinutes !== null ? (
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {showTitle ? <span>{step.title}</span> : null}
                      {step.durationMinutes !== null ? (
                        <Badge variant="secondary">{formatDuration(step.durationMinutes)}</Badge>
                      ) : null}
                    </div>
                  ) : null}
                  <p className={`${showTitle || step.durationMinutes !== null ? 'mt-1 ' : ''}leading-6 text-[var(--muted-foreground)]`}>
                    {step.description}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
