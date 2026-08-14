import { useEffect, useState, type ReactElement } from 'react';

import { ArrowLeft, ChefHat, Clock3, ExternalLink, UsersRound } from 'lucide-react';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

import { IngredientEditor } from '@/components/recipes/ingredient-editor';
import { IngredientLinkRepair } from '@/components/recipes/ingredient-link-repair';
import { RecipeFolderPicker } from '@/components/recipes/recipe-folder-picker';
import { RecipeInstructions } from '@/components/recipes/recipe-instructions';
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
  const [scaleFactor, setScaleFactor] = useState<number>(1);

  useEffect((): void => {
    setScaleFactor(1);
  }, [recipeId]);

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

  const adjustedServings: number = recipe.servings * scaleFactor;

  return (
    <div className="space-y-10">
      <Link className="inline-flex items-center gap-2 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]" to="/">
        <ArrowLeft size={16} />
        Back to library
      </Link>

      <div className="grid items-start gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,0.65fr)]">
        <section className="min-w-0 lg:col-start-1 lg:row-start-1">
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
            <Link
              className="mt-7 inline-block"
              params={{ recipeId: recipe.id }}
              search={{ servings: adjustedServings === recipe.servings ? undefined : adjustedServings }}
              to="/recipes/$recipeId/cook"
            >
              <Button size="lg">
                <ChefHat size={18} />
                Start cooking
              </Button>
            </Link>
          </div>
        </section>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100vh-7.5rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
          <IngredientEditor onScaleFactorChange={setScaleFactor} recipe={recipe} />
          <RecipeFolderPicker recipe={recipe} />
        </aside>

        <section className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
          <IngredientLinkRepair recipe={recipe} />
          <RecipeInstructions steps={recipe.steps} />
        </section>
      </div>
      <Outlet />
    </div>
  );
}

function RecipeDetailLoading(): ReactElement {
  return (
    <div aria-label="Loading recipe" className="space-y-10">
      <div className="h-5 w-32 animate-pulse rounded-md bg-[var(--muted)]" />
      <div className="grid items-start gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,0.65fr)]">
        <section className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="max-w-3xl animate-pulse">
            <div className="flex gap-2">
              <div className="h-6 w-24 rounded-full bg-[var(--muted)]" />
              <div className="h-6 w-20 rounded-full bg-[var(--muted)]" />
            </div>
            <div className="mt-5 h-14 w-4/5 rounded-xl bg-[var(--muted)] sm:h-16" />
            <div className="mt-5 h-5 w-full rounded-md bg-[var(--muted)]" />
            <div className="mt-2 h-5 w-3/4 rounded-md bg-[var(--muted)]" />
            <div className="mt-6 h-5 w-72 max-w-full rounded-md bg-[var(--muted)]" />
            <div className="mt-7 h-11 w-40 rounded-lg bg-[var(--muted)]" />
          </div>
        </section>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100vh-7.5rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
          <Card className="h-[34rem] animate-pulse bg-[var(--muted)]" />
          <Card className="h-40 animate-pulse bg-[var(--muted)]" />
        </aside>

        <section className="min-w-0 lg:col-start-1 lg:row-start-2">
          <Card className="overflow-hidden">
            <div className="h-20 animate-pulse border-b border-[var(--border)] bg-[var(--muted)]" />
            <div className="space-y-5 p-5 sm:p-6">
              {[1, 2, 3].map((step: number): ReactElement => (
                <div className="flex gap-4" key={step}>
                  <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-[var(--muted)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--muted)]" />
                    <div className="h-4 w-full animate-pulse rounded bg-[var(--muted)]" />
                    <div className="h-4 w-4/5 animate-pulse rounded bg-[var(--muted)]" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
