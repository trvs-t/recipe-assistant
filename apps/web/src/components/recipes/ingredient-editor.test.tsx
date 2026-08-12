import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adapterMocks = vi.hoisted(() => ({
  updateIngredient: vi.fn((): Promise<void> => Promise.resolve()),
  addIngredientVariation: vi.fn((): Promise<string> => Promise.resolve('ingredient-variant-new')),
}));

vi.mock('@/lib/supabase', () => ({ supabaseAdapter: adapterMocks }));

import { IngredientEditor } from './ingredient-editor';

import type { IRecipe } from '@/features/recipes/contracts';

const recipe: IRecipe = {
  id: 'test-recipe',
  title: 'Test recipe',
  description: 'Test description',
  collection: 'Test collection',
  tags: [],
  sourceUrl: null,
  servings: 2,
  prepMinutes: 5,
  cookMinutes: 10,
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: 'parsed',
  ingredients: [
    { id: 'ingredient-1', quantity: 2, unit: null, name: 'eggs', note: 'room temperature' },
    { id: 'ingredient-2', quantity: 1, unit: 'cup', name: 'rice', note: null },
  ],
  steps: [],
};

beforeEach((): void => {
  adapterMocks.updateIngredient.mockClear();
  adapterMocks.addIngredientVariation.mockClear();
});

afterEach((): void => {
  cleanup();
});

describe('IngredientEditor', (): void => {
  it('combines portion controls and in-place ingredient details in one section', (): void => {
    renderEditor(recipe);

    expect(screen.getByText('Ingredients')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'By portions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'By ingredient' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Servings')).toHaveValue(2);
    expect(screen.queryByRole('button', { name: 'Reset servings to 2' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Name for eggs')).toHaveValue('eggs');
    expect(screen.getByLabelText('Amount for eggs')).toHaveValue(2);
    expect(screen.getByLabelText('Notes for eggs')).toHaveValue('room temperature');
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('keeps portions and every amount synchronized with the actively edited ingredient', async (): Promise<void> => {
    const user = userEvent.setup();
    renderEditor(recipe);

    const riceAmount: HTMLElement = screen.getByLabelText('Amount for rice');
    await user.clear(riceAmount);
    await user.type(riceAmount, '3');

    expect(screen.getByLabelText('Amount for eggs')).toHaveValue(6);
    expect(screen.getByLabelText('Amount for rice')).toHaveValue(3);
    expect(screen.getByLabelText('Servings')).toHaveValue(6);
    expect(screen.getByRole('button', { name: 'Reset servings to 2' })).toBeInTheDocument();
  });

  it('scales every in-place amount when portions change', async (): Promise<void> => {
    const user = userEvent.setup();
    renderEditor(recipe);

    await user.click(screen.getByRole('button', { name: 'Increase servings' }));

    expect(screen.getByLabelText('Servings')).toHaveValue(3);
    expect(screen.getByLabelText('Amount for eggs')).toHaveValue(3);
    expect(screen.getByLabelText('Amount for rice')).toHaveValue(1.5);

    await user.click(screen.getByRole('button', { name: 'Reset servings to 2' }));
    expect(screen.getByLabelText('Servings')).toHaveValue(2);
    expect(screen.getByLabelText('Amount for eggs')).toHaveValue(2);
    expect(screen.queryByRole('button', { name: 'Reset servings to 2' })).not.toBeInTheDocument();
  });

  it('commits a text edit with Enter without a submit control', async (): Promise<void> => {
    const user = userEvent.setup();
    renderEditor(recipe);

    const nameInput: HTMLElement = screen.getByLabelText('Name for eggs');
    await user.clear(nameInput);
    await user.type(nameInput, 'duck eggs{Enter}');

    await waitFor((): void => {
      expect(adapterMocks.updateIngredient).toHaveBeenCalledWith(
        recipe.id,
        'ingredient-1',
        expect.objectContaining({ name: 'duck eggs', note: 'room temperature', quantity: 2 }),
      );
    });
    expect(adapterMocks.updateIngredient).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status', { name: 'duck eggs saved' })).toHaveClass('saved-indicator');
    expect(screen.queryByText('Saved. Further changes save automatically.')).not.toBeInTheDocument();
  });

  it('directly creates the first variant from the icon button', async (): Promise<void> => {
    const user = userEvent.setup();
    renderEditor(recipe);

    await user.click(screen.getByRole('button', { name: 'Add variant for eggs' }));

    expect(adapterMocks.addIngredientVariation).toHaveBeenCalledWith(
      recipe.id,
      expect.objectContaining({
        name: 'eggs alternative',
        quantity: 2,
        variationOfId: 'ingredient-1',
      }),
    );
  });

  it('shows a semantic variant icon, count badge, and menu when an ingredient has alternatives', async (): Promise<void> => {
    const user = userEvent.setup();
    const recipeWithVariant: IRecipe = {
      ...recipe,
      ingredients: [
        ...recipe.ingredients,
        {
          id: 'ingredient-1-variant',
          quantity: 2,
          unit: null,
          name: 'flax eggs',
          note: 'mixed with water',
          variationOfId: 'ingredient-1',
        },
      ],
    };
    renderEditor(recipeWithVariant);

    expect(screen.queryByText(/This recipe has ingredient variants/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('1 variant for eggs')).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: 'Edit variants for eggs' }));
    expect(screen.getByRole('menuitemradio', { name: 'eggs' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitemradio', { name: 'flax eggs' }));
    expect(screen.getByLabelText('Name for flax eggs')).toHaveValue('flax eggs');
    expect(screen.getByLabelText('Notes for flax eggs')).toHaveValue('mixed with water');
  });
});

function renderEditor(currentRecipe: IRecipe): void {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <IngredientEditor recipe={currentRecipe} />
    </QueryClientProvider>,
  );
}
