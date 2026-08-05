import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const adapterMocks = vi.hoisted(() => ({
  updateIngredient: vi.fn((): Promise<void> => Promise.resolve()),
  addIngredientVariation: vi.fn((): Promise<void> => Promise.resolve()),
}));

vi.mock('@/lib/supabase', () => ({ supabaseAdapter: adapterMocks }));

import { IngredientEditor } from './ingredient-editor';

import { getDemoRecipe } from '@/features/recipes/demo-data';
import type { IRecipe } from '@/features/recipes/contracts';

afterEach((): void => {
  cleanup();
});

describe('IngredientEditor', (): void => {
  it('edits an ingredient and pre-fills a variation with the source amount', async (): Promise<void> => {
    const user = userEvent.setup();
    const recipe: IRecipe | null = getDemoRecipe('demo-miso-salmon');
    if (recipe === null) {
      throw new Error('Demo recipe fixture is missing');
    }

    const queryClient: QueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <IngredientEditor recipe={recipe} />
      </QueryClientProvider>,
    );

    const salmonName: HTMLElement = screen.getByLabelText('Name', { selector: '#ingredient-name-miso-salmon-1' });
    await user.clear(salmonName);
    await user.type(salmonName, 'trout');
    const saveButtons = screen.getAllByRole('button', { name: 'Save changes' });
    const firstSaveButton: HTMLElement | undefined = saveButtons[0];
    if (firstSaveButton === undefined) {
      throw new Error('Ingredient save button is missing');
    }
    await user.click(firstSaveButton);

    expect(await screen.findByText('Ingredient saved.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add variation for salmon' }));

    expect(screen.getByLabelText('Variation name')).toHaveValue('salmon alternative');
    expect(screen.getByLabelText('Amount', { selector: '#variation-amount-miso-salmon-1' })).toHaveValue(2);

    await waitFor((): void => {
      expect(screen.getByText('The amount starts with the original value so you only need to change what differs.')).toBeInTheDocument();
    });
  });
});
