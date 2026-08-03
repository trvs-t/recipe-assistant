import type { ReactElement } from 'react';

import { ArrowUpRight, Clock3, UsersRound } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { formatDate, formatDuration, getSourceLabel } from '@/lib/format';

import type { IRecipeSummary } from '@/features/recipes/contracts';

export interface IRecipeCardProps {
  recipe: IRecipeSummary;
}

export function RecipeCard({ recipe }: IRecipeCardProps): ReactElement {
  return (
    <Card className="group flex h-full flex-col overflow-hidden transition-transform duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]">
      <CardHeader className="relative flex-1 pb-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Badge variant="secondary">{recipe.collection}</Badge>
          <span className="text-xs text-[var(--muted-foreground)]">{formatDate(recipe.updatedAt)}</span>
        </div>
        <Link
          className="font-display text-2xl font-semibold leading-tight tracking-tight hover:text-[var(--primary)]"
          params={{ recipeId: recipe.id }}
          to="/recipes/$recipeId"
        >
          {recipe.title}
        </Link>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--muted-foreground)]">{recipe.description}</p>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex flex-wrap gap-2">
          {recipe.tags.slice(0, 3).map((tag: string): ReactElement => (
            <span className="rounded-md bg-[var(--background-subtle)] px-2 py-1 text-xs text-[var(--muted-foreground)]" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </CardContent>
      <CardFooter className="mt-auto justify-between gap-3 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted-foreground)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={14} />
            {formatDuration((recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0))}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersRound size={14} />
            {recipe.servings}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 font-medium text-[var(--primary)] transition-transform group-hover:translate-x-0.5">
          View recipe
          <ArrowUpRight size={15} />
        </span>
        <span className="sr-only">Source: {getSourceLabel(recipe.sourceUrl)}</span>
      </CardFooter>
    </Card>
  );
}
