import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReactElement, ReactNode } from 'react';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }): ReactElement => <a href="/recipes/cooking">{children}</a>,
}));

import { CookingMode, getCookingIngredients } from './cooking-mode';

import type { IRecipe } from '@/features/recipes/contracts';

const recipe: IRecipe = {
  id: 'cooking-recipe',
  title: 'Test soup',
  description: 'A test recipe.',
  collection: 'Test recipes',
  tags: [],
  sourceUrl: null,
  servings: 2,
  prepMinutes: 5,
  cookMinutes: 20,
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: 'parsed',
  ingredients: [
    { id: 'salt', quantity: null, unit: null, name: 'salt', note: null },
    { id: 'stock', quantity: 2, unit: 'cups', name: 'stock', note: null },
  ],
  steps: [
    { id: 'step-1', title: 'Start the pot', description: 'Warm the stock in a saucepan.', durationMinutes: 5 },
    { id: 'step-2', title: 'Season and serve', description: 'Season with salt, then serve hot.', durationMinutes: null },
  ],
  flow: {
    derivation: 'enriched',
    nodes: [
      { id: 'node-1', stepId: 'step-1', ingredientIds: ['stock'] },
      { id: 'node-2', stepId: 'step-2', ingredientIds: ['salt'] },
    ],
    edges: [{ id: 'edge-1', fromNodeId: 'node-1', toNodeId: 'node-2', kind: 'sequence' }],
  },
};

afterEach((): void => {
  cleanup();
});

describe('CookingMode', (): void => {
  it('shows one large instruction and navigates with buttons and keyboard', async (): Promise<void> => {
    const user = userEvent.setup();
    render(<CookingMode recipe={recipe} />);

    const dialog: HTMLElement = screen.getByRole('dialog', { name: 'Test soup' });
    expect(within(dialog).queryByText('Cooking mode')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Progress')).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/^Step 1$/)).not.toBeInTheDocument();
    expect(within(dialog).getByText('Warm the stock in a saucepan.')).toBeInTheDocument();
    expect(within(dialog).getByText('2 cups')).toBeInTheDocument();
    expect(screen.getByLabelText('Cooking progress: 1 of 2 steps')).toHaveAttribute('aria-valuenow', '1');
    expect(within(dialog).getByText('stock').closest('li')).toHaveAttribute('data-cooking-state', 'current');
    expect(within(dialog).getByText('salt').closest('li')).toHaveAttribute('data-cooking-state', 'upcoming');

    await user.click(screen.getByRole('button', { name: 'Next step' }));

    expect(screen.getByText('Season with salt, then serve hot.')).toBeInTheDocument();
    expect(screen.getByText('to taste')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeEnabled();
    expect(within(dialog).getByText('stock').closest('li')).toHaveAttribute('data-cooking-state', 'used');
    expect(within(dialog).getByText('salt').closest('li')).toHaveAttribute('data-cooking-state', 'current');

    await user.keyboard('{ArrowLeft}');

    expect(screen.getByText('Warm the stock in a saucepan.')).toBeInTheDocument();
  });

  it('falls back to all ingredients when the recipe has no links', (): void => {
    const fallbackRecipe: IRecipe = { ...recipe, flow: undefined };

    expect(getCookingIngredients(fallbackRecipe, 'step-1')).toEqual(recipe.ingredients);
    render(<CookingMode recipe={fallbackRecipe} />);

    expect(screen.getByRole('heading', { name: 'Ingredients' })).toBeInTheDocument();
    expect(screen.queryByText(/for this step/i)).not.toBeInTheDocument();
    expect(screen.getByText('stock').closest('li')).toHaveAttribute('data-cooking-state', 'unlinked');
  });

  it('moves between steps with a horizontal touch swipe', (): void => {
    render(<CookingMode recipe={recipe} />);
    const stepPanel: HTMLElement = screen.getByTestId('cooking-step-panel');

    fireEvent.touchStart(stepPanel, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(stepPanel, { changedTouches: [{ clientX: 120, clientY: 110 }] });
    expect(screen.getByText('Season with salt, then serve hot.')).toBeInTheDocument();

    fireEvent.touchStart(stepPanel, { touches: [{ clientX: 120, clientY: 100 }] });
    fireEvent.touchEnd(stepPanel, { changedTouches: [{ clientX: 300, clientY: 110 }] });
    expect(screen.getByText('Warm the stock in a saucepan.')).toBeInTheDocument();
  });
});
