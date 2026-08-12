import type { ReactElement, ReactNode } from 'react';

import { createFileRoute, Link } from '@tanstack/react-router';

import { CookingMode } from '@/components/recipes/cooking-mode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRecipeQuery } from '@/features/recipes/queries';
import { scaleQuantityByFactor } from '@/features/recipes/scaling';

import type { IRecipe, IRecipeIngredient } from '@/features/recipes/contracts';

interface ICookingSearch {
  servings?: number;
}

export const Route = createFileRoute('/recipes/$recipeId/cook')({
  component: CookingRoute,
  validateSearch: (search: Record<string, unknown>): ICookingSearch => validateCookingSearch(search),
});

function CookingRoute(): ReactElement {
  const { recipeId } = Route.useParams();
  const { servings: adjustedServings } = Route.useSearch();
  const recipeQuery = useRecipeQuery(recipeId);

  if (recipeQuery.isPending) {
    return (
      <CookingModalBackdrop>
        <Card className="mx-auto h-96 w-full max-w-4xl animate-pulse bg-[var(--muted)]" />
      </CookingModalBackdrop>
    );
  }

  if (recipeQuery.isError) {
    return (
      <CookingModalBackdrop>
        <Card className="mx-auto w-full max-w-2xl p-6">
          <Badge variant="warning">Recipe unavailable</Badge>
          <h1 className="mt-4 font-display text-3xl font-semibold">We could not load this recipe.</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
            {recipeQuery.error instanceof Error ? recipeQuery.error.message : 'Try again in a moment.'}
          </p>
          <Link className="mt-6 inline-block" params={{ recipeId }} to="/recipes/$recipeId">
            <Button variant="outline">Back to recipe</Button>
          </Link>
        </Card>
      </CookingModalBackdrop>
    );
  }

  const recipe: IRecipe | null = recipeQuery.data;
  if (recipe === null) {
    return (
      <CookingModalBackdrop>
        <Card className="mx-auto w-full max-w-2xl p-6">
          <Badge variant="secondary">Not found</Badge>
          <h1 className="mt-4 font-display text-3xl font-semibold">That recipe is not in the library.</h1>
          <Link className="mt-6 inline-block" to="/">
            <Button>Return to library</Button>
          </Link>
        </Card>
      </CookingModalBackdrop>
    );
  }

  const scaleFactor: number = adjustedServings === undefined ? 1 : adjustedServings / recipe.servings;
  const adjustedRecipe: IRecipe = scaleRecipe(recipe, scaleFactor);
  return (
    <CookingModalBackdrop>
      <CookingMode recipe={adjustedRecipe} />
    </CookingModalBackdrop>
  );
}

export function validateCookingSearch(search: Record<string, unknown>): ICookingSearch {
  const servings: number = typeof search.servings === 'number'
    ? search.servings
    : typeof search.servings === 'string' ? Number(search.servings) : Number.NaN;
  return Number.isFinite(servings) && servings > 0 ? { servings } : {};
}

export function scaleRecipe(recipe: IRecipe, scaleFactor: number): IRecipe {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0 || scaleFactor === 1) {
    return recipe;
  }

  return {
    ...recipe,
    servings: recipe.servings * scaleFactor,
    ingredients: recipe.ingredients.map((ingredient: IRecipeIngredient): IRecipeIngredient => ({
      ...ingredient,
      quantity: scaleQuantityByFactor(ingredient.quantity, scaleFactor),
    })),
  };
}

function CookingModalBackdrop({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white/95 px-5 py-6 sm:px-8 sm:py-10 lg:px-10">
      <div className="flex min-h-full items-start justify-center sm:items-center">{children}</div>
    </div>
  );
}
