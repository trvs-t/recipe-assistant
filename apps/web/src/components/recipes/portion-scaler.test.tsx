import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

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
    { id: 'ingredient-1', quantity: 2, unit: null, name: 'eggs', note: null },
    { id: 'ingredient-2', quantity: 1, unit: 'cup', name: 'rice', note: null },
  ],
  steps: [],
};

afterEach((): void => {
  cleanup();
});

describe('PortionScaler', (): void => {
  it('updates ingredient quantities when servings change', async (): Promise<void> => {
    const user = userEvent.setup();
    render(<PortionScaler recipe={recipe} />);

    await user.click(screen.getByRole('button', { name: 'Increase servings' }));

    expect(screen.getByLabelText('Desired servings')).toHaveValue(3);
    expect(screen.getByText('1½ cup')).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: '3 eggs' })).toBeInTheDocument();
  });

  it('switches to ingredient mode while preserving the same scale factor', async (): Promise<void> => {
    const user = userEvent.setup();
    render(<PortionScaler recipe={recipe} />);

    await user.click(screen.getByRole('button', { name: 'Increase servings' }));
    await user.click(screen.getByRole('button', { name: 'By ingredient' }));

    expect(screen.getByLabelText('Amount for eggs')).toHaveValue(3);

    await user.click(screen.getByRole('button', { name: 'By portions' }));

    expect(screen.getByLabelText('Desired servings')).toHaveValue(3);
    expect(screen.getByRole('listitem', { name: '3 eggs' })).toBeInTheDocument();
  });

  it('scales the complete recipe from an amount entered for the selected ingredient', async (): Promise<void> => {
    const user = userEvent.setup();
    render(<PortionScaler recipe={recipe} />);

    await user.click(screen.getByRole('button', { name: 'By ingredient' }));
    const amountInput = screen.getByLabelText('Amount for eggs');
    await user.clear(amountInput);
    await user.type(amountInput, '3');

    expect(screen.getByRole('listitem', { name: '3 eggs' })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount for rice')).toHaveValue(1.5);
    expect(screen.getByLabelText('Calculated servings')).toHaveTextContent('3');
    expect(screen.queryByText(/Scale factor/)).not.toBeInTheDocument();
  });

  it('allows a different ingredient row to become the scaling anchor', async (): Promise<void> => {
    const user = userEvent.setup();
    render(<PortionScaler recipe={recipe} />);

    await user.click(screen.getByRole('button', { name: 'By ingredient' }));
    const riceInput = screen.getByLabelText('Amount for rice');
    await user.clear(riceInput);
    await user.type(riceInput, '3');

    expect(screen.getByRole('listitem', { name: '6 eggs' })).toBeInTheDocument();
    expect(screen.getByLabelText('Amount for rice')).toHaveValue(3);
  });
});
