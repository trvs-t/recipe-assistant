import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const adapterMocks = vi.hoisted(() => ({
  autoLinkRecipe: vi.fn((): Promise<void> => Promise.resolve()),
}));

vi.mock('@/lib/supabase', () => ({ supabaseAdapter: adapterMocks }));

import { IngredientLinkRepair } from './ingredient-link-repair';

import { getDemoRecipe } from '@/features/recipes/demo-data';
import type { IRecipe } from '@/features/recipes/contracts';

afterEach((): void => {
  cleanup();
});

describe('IngredientLinkRepair', (): void => {
  it('offers repair for an unlinked recipe and refreshes it after saving', async (): Promise<void> => {
    const user = userEvent.setup();
    const recipe: IRecipe | null = getDemoRecipe('demo-citrus-soba');
    if (recipe === null) {
      throw new Error('Demo recipe fixture is missing');
    }
    const queryClient: QueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <IngredientLinkRepair recipe={recipe} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Auto-link ingredients' }));

    expect(adapterMocks.autoLinkRecipe).toHaveBeenCalledWith(recipe.id);
    expect(invalidateQueries).toHaveBeenCalled();
  });
});
