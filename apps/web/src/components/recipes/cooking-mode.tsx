import { useEffect, useState, type ReactElement } from 'react';

import { ArrowLeft, Check, ChefHat, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatQuantity } from '@/features/recipes/scaling';

import type { IRecipe, IRecipeIngredient, IRecipeStep } from '@/features/recipes/contracts';

export interface ICookingModeProps {
  recipe: IRecipe;
}

export function CookingMode({ recipe }: ICookingModeProps): ReactElement {
  const [stepIndex, setStepIndex] = useState<number>(0);
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
  const currentIngredients: IRecipeIngredient[] = currentStep === undefined
    ? []
    : getCookingIngredients(recipe, currentStep.id);
  const progressValue: number = recipe.steps.length === 0 ? 0 : stepIndex + 1;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          params={{ recipeId: recipe.id }}
          to="/recipes/$recipeId"
        >
          <ArrowLeft size={16} />
          Back to recipe
        </Link>
        <Badge variant="secondary">
          <ChefHat className="mr-1.5" size={14} />
          Cooking mode
        </Badge>
      </div>

      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">{recipe.title}</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-6xl">Let&apos;s cook.</h1>
          <span className="shrink-0 text-sm font-semibold text-[var(--muted-foreground)]">
            {recipe.steps.length === 0 ? 'No steps' : `${progressValue} / ${recipe.steps.length}`}
          </span>
        </div>
        <div
          aria-label={`Cooking progress: ${progressValue} of ${recipe.steps.length} steps`}
          aria-valuemax={recipe.steps.length}
          aria-valuemin={0}
          aria-valuenow={progressValue}
          className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--muted)]"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
            style={{ width: recipe.steps.length === 0 ? '0%' : `${(progressValue / recipe.steps.length) * 100}%` }}
          />
        </div>
      </header>

      {currentStep === undefined ? (
        <Card className="p-8">
          <p className="text-lg text-[var(--muted-foreground)]">This recipe does not have cooking steps yet.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden border-[var(--primary)]/30 shadow-[var(--shadow-float)]">
          <CardContent className="p-6 sm:p-10">
            <div aria-live="polite">
              <Badge>Step {progressValue}</Badge>
              <h2 className="mt-6 max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
                {currentStep.title}
              </h2>
              <p className="mt-6 max-w-3xl text-xl leading-9 text-[var(--foreground)] sm:text-3xl sm:leading-[1.35]">
                {currentStep.description}
              </p>
              {currentStep.durationMinutes !== null ? (
                <p className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)]">
                  <Clock3 className="text-[var(--primary)]" size={17} />
                  About {currentStep.durationMinutes} minutes
                </p>
              ) : null}
            </div>

            <div className="mt-10 border-t border-[var(--border)] pt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                {currentIngredients.length > 0 ? 'Ingredients for this step' : 'Ingredient links'}
              </p>
              {currentIngredients.length > 0 ? (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {currentIngredients.map((ingredient: IRecipeIngredient): ReactElement => (
                    <li className="rounded-xl bg-[var(--muted)] px-4 py-3" key={ingredient.id}>
                      <span className="font-semibold">{formatIngredientAmount(ingredient)}</span>
                      <span className="ml-2 text-[var(--muted-foreground)]">{ingredient.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
                  No ingredients are linked to this step yet. The instruction is still ready to follow.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
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
      <p className="text-center text-xs text-[var(--muted-foreground)]">Use ← and → on a keyboard to move between steps.</p>
    </div>
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
