import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RecipeInstructions } from './recipe-instructions';

import type { IRecipeStep } from '@/features/recipes/contracts';

afterEach((): void => {
  cleanup();
});

describe('RecipeInstructions', (): void => {
  it('renders recipe steps in order and clips the header to the rounded card', (): void => {
    const steps: IRecipeStep[] = [
      { id: 'step-1', title: 'Prepare the glaze', description: 'Whisk the glaze.', durationMinutes: 5 },
      { id: 'step-2', title: 'Step 2', description: 'Roast until browned.', durationMinutes: null },
    ];

    render(<RecipeInstructions steps={steps} />);

    const list = screen.getByRole('list', { name: 'Ordered recipe steps' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Prepare the glaze');
    expect(items[0]).toHaveTextContent('5 min');
    expect(items[1]).toHaveTextContent('Roast until browned.');
    expect(items[1]).not.toHaveTextContent('Step 2');
    expect(screen.getByRole('heading', { name: 'Instructions' }).parentElement?.parentElement).toHaveClass('overflow-hidden');
  });

  it('shows a useful empty state when instructions are unavailable', (): void => {
    render(<RecipeInstructions steps={[]} />);

    expect(screen.getByText('No instructions were provided for this recipe.')).toBeVisible();
  });
});
