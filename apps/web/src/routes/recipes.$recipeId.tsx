import type { ReactElement } from 'react';

import { ArrowLeft, Clock3, ExternalLink, UsersRound } from 'lucide-react';
import { createFileRoute, Link } from '@tanstack/react-router';

import { PortionScaler } from '@/components/recipes/portion-scaler';
import { RecipeFlowDiagram } from '@/components/recipes/recipe-flow-diagram';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

      <section className="grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
        <div>
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
            {recipe.sourceUrl !== null ? <span>{getSourceLabel(recipe.sourceUrl)}</span> : null}
          </div>
        </div>
        <Card className="bg-[var(--ink)] text-white">
          <CardContent className="p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Recipe path</p>
            <p className="mt-3 text-sm leading-6 text-white/70">
              {recipe.steps.length} steps connect {recipe.ingredients.length} ingredients into one cooking path.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
              <span className="rounded-full border border-white/10 px-3 py-1.5">{recipe.status}</span>
              <span className="rounded-full border border-white/10 px-3 py-1.5">{getSourceLabel(recipe.sourceUrl)}</span>
            </div>
            {recipe.sourceUrl !== null ? (
              <a
                className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-light)] hover:text-white"
                href={recipe.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open source
                <ExternalLink size={15} />
              </a>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[.86fr_1.14fr] lg:items-start">
        <PortionScaler recipe={recipe} />
        <Card>
          <CardHeader>
            <CardTitle>Ingredients, at a glance</CardTitle>
            <p className="text-sm text-[var(--muted-foreground)]">Adjust servings on the left and the quantities stay in sync.</p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {recipe.ingredients.map((ingredient): ReactElement => (
                <div className="rounded-xl bg-[var(--card-muted)] px-4 py-3" key={ingredient.id}>
                  <p className="font-medium">{ingredient.name}</p>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    {ingredient.quantity ?? 'As needed'} {ingredient.unit ?? ''}
                    {ingredient.note !== null ? ` · ${ingredient.note}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-5">
        <div>
          <div className="mb-2 text-sm font-semibold text-[var(--primary)]">Cooking flow</div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">Follow the path, not the page.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            Each node is a real recipe step. Branches show work that can happen in parallel before the next dependency is ready.
          </p>
        </div>
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
