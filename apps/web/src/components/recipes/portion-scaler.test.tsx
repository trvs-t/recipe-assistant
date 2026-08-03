import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PortionScaler } from './portion-scaler';

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
    { id: 'ingredient-1', quantity: 1, unit: 'cup', name: 'rice', note: null },
  ],
  steps: [],
};

describe('PortionScaler', (): void => {
  it('updates ingredient quantities when servings change', async (): Promise<void> => {
    const user = userEvent.setup();
    render(<PortionScaler recipe={recipe} />);

    await user.click(screen.getByRole('button', { name: 'Increase servings' }));

    expect(screen.getByLabelText('Desired servings')).toHaveValue(3);
    expect(screen.getByText('1.5 cup')).toBeInTheDocument();
  });
});
