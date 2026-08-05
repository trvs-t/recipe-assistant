import { useMemo, useState, type ChangeEvent, type ReactElement } from 'react';

import { BookOpen, Search, Sparkles } from 'lucide-react';
import { createFileRoute, Link } from '@tanstack/react-router';

import { RecipeCard } from '@/components/recipes/recipe-card';
import { RecipeFlow } from '@/components/recipes/recipe-flow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useRecipeListQuery } from '@/features/recipes/queries';
import { supabaseAdapter } from '@/lib/supabase';

import type { IRecipeSummary } from '@/features/recipes/contracts';

export const Route = createFileRoute('/')({
  component: LibraryPage,
});

function LibraryPage(): ReactElement {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const recipesQuery = useRecipeListQuery();
  const recipes: IRecipeSummary[] = recipesQuery.data ?? [];
  const normalizedSearchTerm: string = searchTerm.trim().toLowerCase();
  const filteredRecipes: IRecipeSummary[] = useMemo(
    (): IRecipeSummary[] =>
      recipes.filter((recipe: IRecipeSummary): boolean => {
        if (normalizedSearchTerm.length === 0) {
          return true;
        }

        return [recipe.title, recipe.description, recipe.collection, ...recipe.tags]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearchTerm);
      }),
    [normalizedSearchTerm, recipes],
  );

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setSearchTerm(event.target.value);
  };

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-[var(--ink)] px-6 py-9 text-white sm:px-10 sm:py-12 lg:px-14">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[var(--primary)]/30 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-[var(--accent)]/20 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-end">
          <div className="max-w-2xl">
            <Badge className="mb-5 bg-white/10 text-[var(--accent-light)]" variant="outline">
              <Sparkles className="mr-1.5" size={13} />
              Your kitchen, better organized
            </Badge>
            <h1 className="font-display text-4xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">
              Keep every good recipe within reach.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
              Collect from the open web, turn noisy pages into clear cooking steps, and scale dinner to the people around your table.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/import">
                <Button className="bg-[var(--accent)] text-[var(--ink)] hover:bg-[var(--accent-light)]" size="lg">
                  Import a recipe
                </Button>
              </Link>
              <span className="text-sm text-white/55">
                {supabaseAdapter.mode === 'demo'
                  ? 'Three sample recipes included in demo mode'
                  : 'Imports save to your private recipe library'}
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-white/50">The collection flow</p>
            <RecipeFlow compact />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">
            <BookOpen size={17} />
            <span>Recipe library</span>
          </div>
          <h2 className="font-display text-3xl font-semibold tracking-tight">What are you cooking next?</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">A calm place for all the tabs you meant to come back to.</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" size={17} />
          <Input aria-label="Search recipes" className="pl-10" onChange={handleSearchChange} placeholder="Search recipes" value={searchTerm} />
        </div>
      </section>

      {recipesQuery.isPending ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((item: number): ReactElement => (
            <Card className="h-72 animate-pulse bg-[var(--muted)]" key={item} />
          ))}
        </div>
      ) : recipesQuery.isError ? (
        <Card className="flex flex-col items-start gap-4 p-6">
          <Badge variant="warning">Could not load library</Badge>
          <p className="max-w-lg text-sm leading-6 text-[var(--muted-foreground)]">
            {recipesQuery.error instanceof Error ? recipesQuery.error.message : 'Try again in a moment.'}
          </p>
          <Button onClick={(): void => void recipesQuery.refetch()} variant="outline">
            Try again
          </Button>
        </Card>
      ) : filteredRecipes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
            <Search size={21} />
          </span>
          <h3 className="font-display text-xl font-semibold">No recipes found</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
            Try a different search, or import the recipe you are thinking about.
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredRecipes.map((recipe: IRecipeSummary): ReactElement => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}
