import type { ReactElement } from 'react';

import { ArrowLeft, ChefHat, Clock3, ExternalLink, UsersRound } from 'lucide-react';
import { createFileRoute, Link } from '@tanstack/react-router';

import { PortionScaler } from '@/components/recipes/portion-scaler';
import { IngredientEditor } from '@/components/recipes/ingredient-editor';
import { RecipeFlowDiagram } from '@/components/recipes/recipe-flow-diagram';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useRecipeQuery } from '@/features/recipes/queries';
import { formatDuration, getSourceLabel } from '@/lib/format';

import type { IRecipe } from '@/features/recipes/contracts';

export const Route = createFileRoute('/recipes/$recipeId')({
  component: RecipeDetailPage,
});

function RecipeDetailPage(): ReactElement {
  const { recipeId } = Route.useParams();
  const recipeQuery = useRecipeQuery(recipeId);

  if (recipeQuery.isPending) {
    return <RecipeDetailLoading />;
  }

  if (recipeQuery.isError) {
    return (
      <Card className="mx-auto max-w-2xl p-6">
        <Badge variant="warning">Recipe unavailable</Badge>
        <h1 className="mt-4 font-display text-3xl font-semibold">We could not load this recipe.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
          {recipeQuery.error instanceof Error ? recipeQuery.error.message : 'Try again in a moment.'}
        </p>
        <Link className="mt-6 inline-block" to="/">
          <Button variant="outline">Back to library</Button>
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

  const totalMinutes: number = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  return (
    <div className="space-y-10">
      <Link className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]" to="/">
        <ArrowLeft size={16} />
        Back to library
      </Link>

      <section>
        <div className="max-w-3xl">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge>{recipe.collection}</Badge>
            <Badge variant={recipe.status === 'parsed' ? 'success' : 'warning'}>{recipe.status}</Badge>
          </div>
          <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">{recipe.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted-foreground)] sm:text-lg">{recipe.description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-[var(--muted-foreground)]">
            <span className="inline-flex items-center gap-2">
              <Clock3 className="text-[var(--primary)]" size={17} />
              {formatDuration(totalMinutes)} total
            </span>
            <span className="inline-flex items-center gap-2">
              <UsersRound className="text-[var(--primary)]" size={17} />
              {recipe.servings} servings
            </span>
            {recipe.sourceUrl !== null ? (
              <a
                className="inline-flex items-center gap-1.5 hover:text-[var(--foreground)] hover:underline"
                href={recipe.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {getSourceLabel(recipe.sourceUrl)}
                <ExternalLink aria-hidden="true" size={13} />
              </a>
            ) : null}
          </div>
          <Link className="mt-7 inline-block" params={{ recipeId: recipe.id }} to="/recipes/$recipeId/cook">
            <Button size="lg">
              <ChefHat size={18} />
              Start cooking
            </Button>
          </Link>
        </div>
      </section>

      <section className="max-w-2xl">
        <PortionScaler recipe={recipe} />
      </section>

      <section className="max-w-4xl">
        <IngredientEditor recipe={recipe} />
      </section>

      <section>
        <RecipeFlowDiagram recipe={recipe} />
      </section>
    </div>
  );
}

function RecipeDetailLoading(): ReactElement {
  return (
    <div className="space-y-8">
      <Card className="h-80 animate-pulse bg-[var(--muted)]" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-96 animate-pulse bg-[var(--muted)]" />
        <Card className="h-96 animate-pulse bg-[var(--muted)]" />
      </div>
    </div>
  );
}
