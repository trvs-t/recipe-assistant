import type { ReactElement } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { recipeQueryKeys } from '@/features/recipes/queries';
import { needsIngredientLinkRepair } from '@/features/recipes/ingredient-linking';
import { supabaseAdapter } from '@/lib/supabase';

import type { IRecipe } from '@/features/recipes/contracts';

export interface IIngredientLinkRepairProps {
  recipe: IRecipe;
}

export function IngredientLinkRepair({ recipe }: IIngredientLinkRepairProps): ReactElement | null {
  const queryClient = useQueryClient();
  const repairMutation = useMutation<void, Error>({
    mutationFn: (): Promise<void> => supabaseAdapter.autoLinkRecipe(recipe.id),
    onSuccess: (): void => {
      void queryClient.invalidateQueries({ queryKey: recipeQueryKeys.detail(recipe.id) });
    },
  });

  if (!needsIngredientLinkRepair(recipe)) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-dashed border-[var(--primary)]/40 bg-[var(--primary-soft)]/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-[var(--card)] p-2 text-[var(--primary)]">
          <Link2 size={16} />
        </span>
        <div>
          <p className="font-semibold">Ingredient links need a quick pass</p>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">
            Find clear ingredient mentions in the steps so cooking mode can show what to use.
          </p>
        </div>
      </div>
      <Button
        className="shrink-0"
        disabled={repairMutation.isPending}
        onClick={(): void => repairMutation.mutate()}
        size="sm"
        type="button"
        variant="outline"
      >
        <Sparkles size={15} />
        {repairMutation.isPending ? 'Linking…' : 'Auto-link ingredients'}
      </Button>
      {repairMutation.error !== null ? (
        <p className="text-sm text-[var(--destructive)]">{repairMutation.error.message}</p>
      ) : null}
    </div>
  );
}
