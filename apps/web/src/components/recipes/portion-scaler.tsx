import { useEffect, useState, type ChangeEvent, type ReactElement } from 'react';

import { Minus, Plus, Scale } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatQuantity, scaleQuantity } from '@/features/recipes/scaling';

import type { IRecipe } from '@/features/recipes/contracts';

export interface IPortionScalerProps {
  recipe: IRecipe;
}

export function PortionScaler({ recipe }: IPortionScalerProps): ReactElement {
  const [desiredServings, setDesiredServings] = useState<number>(recipe.servings);

  useEffect((): void => {
    setDesiredServings(recipe.servings);
  }, [recipe.id, recipe.servings]);

  const handleServingsChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const nextServings: number = Number(event.target.value);
    if (Number.isFinite(nextServings) && nextServings >= 1 && nextServings <= 100) {
      setDesiredServings(Math.round(nextServings));
    }
  };

  const changeServings = (amount: number): void => {
    setDesiredServings((current: number): number => Math.min(100, Math.max(1, current + amount)));
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">
            <Scale size={15} />
            Portion scaler
          </div>
          <CardTitle>Make it fit the table</CardTitle>
        </div>
        <span className="rounded-lg bg-[var(--muted)] px-2.5 py-1.5 text-xs text-[var(--muted-foreground)]">
          {recipe.servings} original
        </span>
      </CardHeader>
      <CardContent>
        <div className="mb-5 flex items-center gap-2">
          <Button aria-label="Decrease servings" onClick={(): void => changeServings(-1)} size="icon" variant="outline">
            <Minus size={16} />
          </Button>
          <Input
            aria-label="Desired servings"
            className="w-24 text-center font-semibold"
            min={1}
            max={100}
            onChange={handleServingsChange}
            type="number"
            value={desiredServings}
          />
          <Button aria-label="Increase servings" onClick={(): void => changeServings(1)} size="icon" variant="outline">
            <Plus size={16} />
          </Button>
          <span className="ml-1 text-sm text-[var(--muted-foreground)]">servings</span>
        </div>
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {recipe.ingredients.map((ingredient): ReactElement => {
            const scaledQuantity: number | null = scaleQuantity(ingredient.quantity, recipe.servings, desiredServings);
            const quantityLabel: string = formatQuantity(scaledQuantity);
            const measurement: string = ingredient.unit === null ? quantityLabel : `${quantityLabel} ${ingredient.unit}`;

            return (
              <li className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm" key={ingredient.id}>
                <span className="font-medium">{ingredient.name}</span>
                <span className="shrink-0 text-right text-[var(--muted-foreground)]">
                  {measurement}
                  {ingredient.note !== null ? `, ${ingredient.note}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
