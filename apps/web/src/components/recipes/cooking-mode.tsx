import { useEffect, useRef, useState, type ReactElement, type TouchEvent } from 'react';

import { Check, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatQuantity } from '@/features/recipes/scaling';
import { cn } from '@/lib/cn';

import type { IRecipe, IRecipeIngredient, IRecipeStep } from '@/features/recipes/contracts';

export interface ICookingModeProps {
  recipe: IRecipe;
}

type CookingIngredientState = 'current' | 'upcoming' | 'used' | 'unlinked';

interface ITouchStart {
  x: number;
  y: number;
}

const SWIPE_THRESHOLD_PX: number = 60;

export function CookingMode({ recipe }: ICookingModeProps): ReactElement {
  const [stepIndex, setStepIndex] = useState<number>(0);
  const touchStartRef = useRef<ITouchStart | null>(null);
  const lastStepIndex: number = Math.max(0, recipe.steps.length - 1);

  useEffect((): void => {
    setStepIndex(0);
  }, [recipe.id]);

  useEffect((): (() => void) => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        setStepIndex((currentIndex: number): number => Math.min(lastStepIndex, currentIndex + 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        setStepIndex((currentIndex: number): number => Math.max(0, currentIndex - 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, [lastStepIndex]);

  const currentStep: IRecipeStep | undefined = recipe.steps[stepIndex];
  const progressValue: number = recipe.steps.length === 0 ? 0 : stepIndex + 1;
  const linkedIngredients: boolean = hasLinkedIngredientFlow(recipe);
  const ingredientStates: Map<string, CookingIngredientState> = getIngredientStates(recipe, stepIndex, linkedIngredients);

  const handleTouchStart = (event: TouchEvent<HTMLElement>): void => {
    const touch: { clientX: number; clientY: number } | undefined = event.touches[0];
    touchStartRef.current = touch === undefined ? null : { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLElement>): void => {
    const start: ITouchStart | null = touchStartRef.current;
    const touch: { clientX: number; clientY: number } | undefined = event.changedTouches[0];
    touchStartRef.current = null;
    if (start === null || touch === undefined) {
      return;
    }

    const horizontalDistance: number = touch.clientX - start.x;
    const verticalDistance: number = touch.clientY - start.y;
    if (
      Math.abs(horizontalDistance) < SWIPE_THRESHOLD_PX ||
      Math.abs(horizontalDistance) <= Math.abs(verticalDistance)
    ) {
      return;
    }

    if (horizontalDistance < 0) {
      setStepIndex((currentIndex: number): number => Math.min(lastStepIndex, currentIndex + 1));
    } else {
      setStepIndex((currentIndex: number): number => Math.max(0, currentIndex - 1));
    }
  };

  return (
    <Card
      aria-labelledby="cooking-dialog-title"
      aria-modal="true"
      className="w-full max-w-7xl overflow-hidden border-[var(--primary)]/30 shadow-[var(--shadow-float)]"
      role="dialog"
    >
      <CardContent className="p-6 sm:p-8 lg:p-10">
        <header>
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl" id="cooking-dialog-title">
              {recipe.title}
            </h1>
            <Link
              aria-label="Close cooking mode"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              params={{ recipeId: recipe.id }}
              search={{}}
              to="/recipes/$recipeId"
            >
              <X size={20} />
            </Link>
          </div>
          <p className="mt-6 text-right text-sm font-semibold text-[var(--muted-foreground)]">
            {recipe.steps.length === 0 ? 'No steps' : `${progressValue} / ${recipe.steps.length}`}
          </p>
          <div
            aria-label={`Cooking progress: ${progressValue} of ${recipe.steps.length} steps`}
            aria-valuemax={recipe.steps.length}
            aria-valuemin={0}
            aria-valuenow={progressValue}
            className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--muted)]"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
              style={{ width: recipe.steps.length === 0 ? '0%' : `${(progressValue / recipe.steps.length) * 100}%` }}
            />
          </div>
        </header>

        <div className="mt-8 grid items-start gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,0.65fr)]">
          <section
            className="min-w-0 touch-pan-y lg:col-start-1"
            data-testid="cooking-step-panel"
            onTouchCancel={(): void => { touchStartRef.current = null; }}
            onTouchEnd={handleTouchEnd}
            onTouchStart={handleTouchStart}
          >
            {currentStep === undefined ? (
              <p className="text-lg text-[var(--muted-foreground)]">This recipe does not have cooking steps yet.</p>
            ) : (
              <div aria-live="polite">
                <h2 className="max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
                  {currentStep.title}
                </h2>
                <p className="mt-5 max-w-3xl text-xl leading-9 text-[var(--foreground)] sm:text-3xl sm:leading-[1.35]">
                  {currentStep.description}
                </p>
                {currentStep.durationMinutes !== null ? (
                  <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]">
                    <Clock3 className="text-[var(--primary)]" size={17} />
                    About {currentStep.durationMinutes} minutes
                  </p>
                ) : null}
              </div>
            )}

            <div className="mt-8 grid gap-3 border-t border-[var(--border)] pt-6 sm:grid-cols-2">
              <Button
                aria-label="Previous step"
                className="h-14 text-base"
                disabled={stepIndex === 0 || recipe.steps.length === 0}
                onClick={(): void => setStepIndex((currentIndex: number): number => Math.max(0, currentIndex - 1))}
                size="lg"
                type="button"
                variant="outline"
              >
                <ChevronLeft size={20} />
                Previous
              </Button>
              <Button
                aria-label="Next step"
                className="h-14 text-base"
                disabled={stepIndex >= lastStepIndex || recipe.steps.length === 0}
                onClick={(): void => setStepIndex((currentIndex: number): number => Math.min(lastStepIndex, currentIndex + 1))}
                size="lg"
                type="button"
              >
                {stepIndex >= lastStepIndex ? <Check size={20} /> : <ChevronRight size={20} />}
                {stepIndex >= lastStepIndex ? 'Last step' : 'Next step'}
              </Button>
            </div>
            <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
              Swipe, or use ← and → on a keyboard, to move between steps.
            </p>
          </section>

          <aside className="min-w-0 rounded-2xl bg-[var(--muted)]/55 p-5 sm:p-6 lg:col-start-2">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Ingredients</h2>
            {recipe.ingredients.length === 0 ? (
              <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">This recipe does not have ingredients yet.</p>
            ) : (
              <ul aria-label="Recipe ingredients" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {recipe.ingredients.map((ingredient: IRecipeIngredient): ReactElement => {
                  const state: CookingIngredientState = ingredientStates.get(ingredient.id) ?? 'unlinked';
                  return (
                    <li
                      className={cn(
                        'flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                        state === 'current' && 'border-[var(--primary)] bg-[var(--primary-soft)]',
                        state === 'used' && 'border-transparent bg-[var(--card)] opacity-50',
                        (state === 'upcoming' || state === 'unlinked') && 'border-transparent bg-[var(--card)]',
                      )}
                      data-cooking-state={state}
                      key={ingredient.id}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        {state === 'used' ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                            <Check aria-hidden="true" size={14} strokeWidth={3} />
                          </span>
                        ) : null}
                        <span className="truncate text-[var(--muted-foreground)]">{ingredient.name}</span>
                      </span>
                      <span className="ml-auto shrink-0 font-semibold">
                        {formatIngredientAmount(ingredient)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </CardContent>
    </Card>
  );
}

function hasLinkedIngredientFlow(recipe: IRecipe): boolean {
  return recipe.flow?.derivation === 'enriched' && recipe.flow.nodes.some(
    (node): boolean => node.ingredientIds.length > 0,
  );
}

function getIngredientStates(
  recipe: IRecipe,
  stepIndex: number,
  linkedIngredients: boolean,
): Map<string, CookingIngredientState> {
  const flow = recipe.flow;
  if (!linkedIngredients || flow === undefined || flow === null) {
    return new Map<string, CookingIngredientState>(
      recipe.ingredients.map((ingredient: IRecipeIngredient): [string, CookingIngredientState] => [ingredient.id, 'unlinked']),
    );
  }

  const ingredientIdsByStepId: Map<string, string[]> = new Map<string, string[]>(
    flow.nodes.map((node): [string, string[]] => [node.stepId, node.ingredientIds]),
  );
  const currentStep: IRecipeStep | undefined = recipe.steps[stepIndex];
  const currentIngredientIds: Set<string> = new Set<string>(
    currentStep === undefined ? [] : ingredientIdsByStepId.get(currentStep.id) ?? [],
  );
  const usedIngredientIds: Set<string> = new Set<string>(
    recipe.steps
      .slice(0, stepIndex)
      .flatMap((step: IRecipeStep): string[] => ingredientIdsByStepId.get(step.id) ?? []),
  );

  return new Map<string, CookingIngredientState>(
    recipe.ingredients.map((ingredient: IRecipeIngredient): [string, CookingIngredientState] => {
      if (currentIngredientIds.has(ingredient.id)) {
        return [ingredient.id, 'current'];
      }
      return [ingredient.id, usedIngredientIds.has(ingredient.id) ? 'used' : 'upcoming'];
    }),
  );
}

export function getCookingIngredients(recipe: IRecipe, stepId: string): IRecipeIngredient[] {
  const flowNode = recipe.flow?.nodes.find((node): boolean => node.stepId === stepId);
  if (recipe.flow?.derivation === 'enriched' && flowNode !== undefined) {
    const ingredientsById: Map<string, IRecipeIngredient> = new Map<string, IRecipeIngredient>(
      recipe.ingredients.map((ingredient: IRecipeIngredient): [string, IRecipeIngredient] => [ingredient.id, ingredient]),
    );
    return flowNode.ingredientIds.flatMap((ingredientId: string): IRecipeIngredient[] => {
      const ingredient: IRecipeIngredient | undefined = ingredientsById.get(ingredientId);
      return ingredient === undefined ? [] : [ingredient];
    });
  }

  return [...recipe.ingredients];
}

function formatIngredientAmount(ingredient: IRecipeIngredient): string {
  const quantity: string = formatQuantity(ingredient.quantity);
  return ingredient.unit === null ? quantity : `${quantity} ${ingredient.unit}`;
}
