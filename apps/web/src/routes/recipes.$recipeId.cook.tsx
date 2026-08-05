import type { ReactElement } from 'react';

import { createFileRoute, Link } from '@tanstack/react-router';

import { CookingMode } from '@/components/recipes/cooking-mode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRecipeQuery } from '@/features/recipes/queries';

import type { IRecipe } from '@/features/recipes/contracts';

export const Route = createFileRoute('/recipes/$recipeId/cook')({
  component: CookingRoute,
});

function CookingRoute(): ReactElement {
  const { recipeId } = Route.useParams();
  const recipeQuery = useRecipeQuery(recipeId);

  if (recipeQuery.isPending) {
    return <Card className="mx-auto h-96 max-w-4xl animate-pulse bg-[var(--muted)]" />;
  }

  if (recipeQuery.isError) {
    return (
      <Card className="mx-auto max-w-2xl p-6">
        <Badge variant="warning">Recipe unavailable</Badge>
        <h1 className="mt-4 font-display text-3xl font-semibold">We could not load this recipe.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
          {recipeQuery.error instanceof Error ? recipeQuery.error.message : 'Try again in a moment.'}
        </p>
        <Link className="mt-6 inline-block" params={{ recipeId }} to="/recipes/$recipeId">
          <Button variant="outline">Back to recipe</Button>
        </Link>
      </Card>
    );
  }

  const recipe: IRecipe | null = recipeQuery.data;
  if (recipe === null) {
    return (
      <Card className="mx-auto max-w-2xl p-6">
        <Badge variant="secondary">Not found</Badge>
        <h1 className="mt-4 font-display text-3xl font-semibold">That recipe is not in the library.</h1>
        <Link className="mt-6 inline-block" to="/">
          <Button>Return to library</Button>
        </Link>
      </Card>
    );
  }

  return <CookingMode recipe={recipe} />;
}
