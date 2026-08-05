import { describe, expect, it } from 'vitest';

import type { IRecipe } from './contracts';
import {
  buildDeterministicIngredientFlow,
  needsIngredientLinkRepair,
} from './ingredient-linking';

const recipe: IRecipe = {
  id: 'linking-recipe',
  title: 'Rice bowl',
  description: 'A test recipe.',
  collection: 'Test recipes',
  tags: [],
  sourceUrl: null,
  servings: 2,
  prepMinutes: null,
  cookMinutes: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
  status: 'parsed',
  ingredients: [
    { id: 'rice', quantity: 1, unit: 'cup', name: 'rice', note: null },
    { id: 'salt', quantity: null, unit: null, name: 'salt', note: null },
  ],
  steps: [
    { id: 'step-1', title: 'Cook', description: 'Cook the rice until tender.', durationMinutes: null },
    { id: 'step-2', title: 'Season', description: 'Season with salt and serve.', durationMinutes: null },
  ],
};

describe('ingredient linking', (): void => {
  it('builds an enriched flow from explicit step mentions', (): void => {
    const flow = buildDeterministicIngredientFlow(recipe);

    expect(flow?.derivation).toBe('enriched');
    expect(flow?.nodes.map((node) => node.ingredientIds)).toEqual([['rice'], ['salt']]);
  });

  it('identifies recipes that still need link repair', (): void => {
    expect(needsIngredientLinkRepair(recipe)).toBe(true);
    expect(needsIngredientLinkRepair({ ...recipe, flow: buildDeterministicIngredientFlow(recipe) })).toBe(false);
  });
});
