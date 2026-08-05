import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactElement,
} from 'react';

import { Minus, Plus, Scale } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatQuantity, scaleQuantityByFactor } from '@/features/recipes/scaling';

import type { IRecipe, IRecipeIngredient } from '@/features/recipes/contracts';

export interface IPortionScalerProps {
  recipe: IRecipe;
}

type ScaleMode = 'servings' | 'ingredient';

const MIN_SERVINGS: number = 1;
const MAX_SERVINGS: number = 100;

export function PortionScaler({ recipe }: IPortionScalerProps): ReactElement {
  const scalableIngredients: IRecipeIngredient[] = useMemo(
    (): IRecipeIngredient[] => recipe.ingredients.filter(
      (ingredient: IRecipeIngredient): boolean => ingredient.quantity !== null && ingredient.quantity > 0,
    ),
    [recipe.ingredients],
  );
  const firstScalableIngredient: IRecipeIngredient | null = scalableIngredients[0] ?? null;
  const [mode, setMode] = useState<ScaleMode>('servings');
  const [scaleFactor, setScaleFactor] = useState<number>(1);
  const [anchorIngredientId, setAnchorIngredientId] = useState<string | null>(
    firstScalableIngredient?.id ?? null,
  );
  const [servingsInput, setServingsInput] = useState<string>(() => formatInputNumber(recipe.servings));
  const [ingredientInput, setIngredientInput] = useState<string>(() => (
    firstScalableIngredient?.quantity === null || firstScalableIngredient === null
      ? ''
      : formatInputNumber(firstScalableIngredient.quantity)
  ));

  useEffect((): void => {
    const nextAnchorIngredient: IRecipeIngredient | null = recipe.ingredients.find(
      (ingredient: IRecipeIngredient): boolean => ingredient.quantity !== null && ingredient.quantity > 0,
    ) ?? null;

    setMode('servings');
    setScaleFactor(1);
    setAnchorIngredientId(nextAnchorIngredient?.id ?? null);
    setServingsInput(formatInputNumber(recipe.servings));
    setIngredientInput(
      nextAnchorIngredient?.quantity === null || nextAnchorIngredient === null
        ? ''
        : formatInputNumber(nextAnchorIngredient.quantity),
    );
  }, [recipe.id, recipe.ingredients, recipe.servings]);

  const anchorIngredient: IRecipeIngredient | null = scalableIngredients.find(
    (ingredient: IRecipeIngredient): boolean => ingredient.id === anchorIngredientId,
  ) ?? firstScalableIngredient;
  const desiredServings: number = recipe.servings * scaleFactor;
  const anchorAmount: number | null = anchorIngredient === null || anchorIngredient.quantity === null
    ? null
    : anchorIngredient.quantity * scaleFactor;

  const handleServingsChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const nextInput: string = event.target.value;
    setServingsInput(nextInput);

    const nextServings: number = Number(nextInput);
    if (isValidServings(nextServings)) {
      setScaleFactor(nextServings / recipe.servings);
    }
  };

  const changeServings = (amount: number): void => {
    const currentServings: number = isValidServings(Number(servingsInput))
      ? Number(servingsInput)
      : desiredServings;
    const nextServings: number = roundInputNumber(
      Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, currentServings + amount)),
    );
    setServingsInput(formatInputNumber(nextServings));
    setScaleFactor(nextServings / recipe.servings);
  };

  const handleIngredientFocus = (ingredient: IRecipeIngredient, scaledQuantity: number | null): void => {
    if (ingredient.id !== anchorIngredientId && scaledQuantity !== null) {
      setAnchorIngredientId(ingredient.id);
      setIngredientInput(formatInputNumber(scaledQuantity));
    }
  };

  const handleIngredientChange = (
    ingredient: IRecipeIngredient,
    event: ChangeEvent<HTMLInputElement>,
  ): void => {
    const nextInput: string = event.target.value;
    setIngredientInput(nextInput);
    setAnchorIngredientId(ingredient.id);

    const nextAmount: number = Number(nextInput);
    if (ingredient.quantity !== null && isPositiveFinite(nextAmount)) {
      setScaleFactor(nextAmount / ingredient.quantity);
    }
  };

  const switchMode = (nextMode: ScaleMode): void => {
    if (nextMode === 'ingredient' && anchorIngredient === null) {
      return;
    }

    if (nextMode === 'servings') {
      setServingsInput(formatInputNumber(desiredServings));
    } else if (anchorAmount !== null) {
      setIngredientInput(formatInputNumber(anchorAmount));
    }

    setMode(nextMode);
  };

  const resetScaling = (): void => {
    setScaleFactor(1);
    setServingsInput(formatInputNumber(recipe.servings));
    if (anchorIngredient?.quantity !== null && anchorIngredient !== null) {
      setIngredientInput(formatInputNumber(anchorIngredient.quantity));
    }
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
          {recipe.servings} original servings
        </span>
      </CardHeader>
      <CardContent>
        <div aria-label="Scaling mode" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-[var(--muted)] p-1" role="group">
          <Button
            aria-pressed={mode === 'servings'}
            className={mode === 'servings' ? 'bg-[var(--card)] shadow-sm' : ''}
            onClick={(): void => switchMode('servings')}
            variant="ghost"
          >
            By portions
          </Button>
          <Button
            aria-pressed={mode === 'ingredient'}
            className={mode === 'ingredient' ? 'bg-[var(--card)] shadow-sm' : ''}
            disabled={scalableIngredients.length === 0}
            onClick={(): void => switchMode('ingredient')}
            variant="ghost"
          >
            By ingredient
          </Button>
        </div>

        {mode === 'servings' ? (
          <div className="mb-5 flex items-center gap-2">
            <Button
              aria-label="Decrease servings"
              disabled={desiredServings <= MIN_SERVINGS}
              onClick={(): void => changeServings(-1)}
              size="icon"
              variant="outline"
            >
              <Minus size={16} />
            </Button>
            <Input
              aria-label="Desired servings"
              className="w-24 text-center font-semibold"
              min={MIN_SERVINGS}
              max={MAX_SERVINGS}
              onChange={handleServingsChange}
              step="any"
              type="number"
              value={servingsInput}
            />
            <Button
              aria-label="Increase servings"
              disabled={desiredServings >= MAX_SERVINGS}
              onClick={(): void => changeServings(1)}
              size="icon"
              variant="outline"
            >
              <Plus size={16} />
            </Button>
            <span className="ml-1 text-sm text-[var(--muted-foreground)]">servings</span>
          </div>
        ) : (
          <div aria-label="Calculated servings" className="mb-5 flex items-center gap-2">
            <span className="w-24 rounded-xl bg-[var(--muted)] px-4 py-3 text-center text-sm font-semibold">
              {formatQuantity(desiredServings)}
            </span>
            <span className="text-sm text-[var(--muted-foreground)]">servings</span>
          </div>
        )}

        <div className="mb-5 flex justify-end">
          <Button aria-label="Reset scaling" onClick={resetScaling} size="sm" variant="ghost">
            Reset
          </Button>
        </div>

        <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {recipe.ingredients.map((ingredient): ReactElement => {
            const scaledQuantity: number | null = scaleQuantityByFactor(ingredient.quantity, scaleFactor);
            const measurement: string = formatMeasurement(scaledQuantity, ingredient.unit);
            const canEditIngredient: boolean = mode === 'ingredient' && ingredient.quantity !== null && ingredient.quantity > 0;
            const inputValue: string = ingredient.id === anchorIngredient?.id
              ? ingredientInput
              : scaledQuantity === null
                ? ''
                : formatInputNumber(scaledQuantity);

            return (
              <li
                aria-label={`${measurement} ${ingredient.name}`}
                className={`flex items-baseline justify-between gap-4 px-4 py-3 text-sm ${mode === 'ingredient' && ingredient.id === anchorIngredient?.id ? 'bg-[var(--primary-soft)]' : ''}`}
                key={ingredient.id}
              >
                <span className="font-medium">{ingredient.name}</span>
                {canEditIngredient ? (
                  <span className="flex shrink-0 items-center gap-2 text-[var(--muted-foreground)]">
                    <Input
                      aria-label={`Amount for ${ingredient.name}`}
                      className="w-24 text-right font-semibold"
                      min="0"
                      onChange={(event: ChangeEvent<HTMLInputElement>): void => handleIngredientChange(ingredient, event)}
                      onFocus={(): void => handleIngredientFocus(ingredient, scaledQuantity)}
                      step="any"
                      type="number"
                      value={inputValue}
                    />
                    {ingredient.unit !== null ? <span>{ingredient.unit}</span> : null}
                    {ingredient.note !== null ? `, ${ingredient.note}` : ''}
                  </span>
                ) : (
                  <span className="shrink-0 text-right text-[var(--muted-foreground)]">
                    {measurement}
                    {ingredient.note !== null ? `, ${ingredient.note}` : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function formatMeasurement(quantity: number | null, unit: string | null): string {
  const quantityLabel: string = formatQuantity(quantity);
  return unit === null ? quantityLabel : `${quantityLabel} ${unit}`;
}

function formatInputNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }

  return roundInputNumber(value).toString();
}

function roundInputNumber(value: number): number {
  return Number(value.toFixed(6));
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidServings(value: number): boolean {
  return isPositiveFinite(value) && value >= MIN_SERVINGS && value <= MAX_SERVINGS;
}
