import { describe, expect, it } from 'vitest';

import type { IRecipeIngredient } from './contracts';
import {
  ingredientToFormValues,
  parseIngredientFormValues,
  variationToFormValues,
  type IIngredientFormValues,
} from './ingredient-editing';

const ingredient: IRecipeIngredient = {
  id: 'ingredient-1',
  quantity: 2,
  unit: 'cups',
  name: 'rice',
  note: 'cooked',
};

describe('ingredient editing', (): void => {
  it('creates editable values from a saved ingredient', (): void => {
    expect(ingredientToFormValues(ingredient)).toEqual({
      name: 'rice',
      amount: '2',
      unit: 'cups',
      note: 'cooked',
    });
  });

  it('defaults a variation to the source amount and a distinct name', (): void => {
    expect(variationToFormValues(ingredient)).toEqual({
      name: 'rice alternative',
      amount: '2',
      unit: 'cups',
      note: 'cooked',
    });
  });

  it('normalizes editable values into a persistence input', (): void => {
    const values: IIngredientFormValues = {
      name: '  jasmine rice ',
      amount: '1.5',
      unit: ' cups ',
      note: ' rinsed ',
    };

    expect(parseIngredientFormValues(values)).toEqual({
      input: {
        name: 'jasmine rice',
        quantity: 1.5,
        unit: 'cups',
        note: 'rinsed',
      },
      error: null,
    });
  });

  it('allows blank amount for ingredients measured to taste', (): void => {
    const result = parseIngredientFormValues({
      name: 'olive oil',
      amount: '',
      unit: '',
      note: '',
    });

    expect(result.input?.quantity).toBeNull();
    expect(result.error).toBeNull();
  });

  it('rejects missing names and non-positive amounts', (): void => {
    expect(parseIngredientFormValues({ name: ' ', amount: '1', unit: '', note: '' }).error).toBe('Add an ingredient name.');
    expect(parseIngredientFormValues({ name: 'salt', amount: '0', unit: '', note: '' }).error).toContain('positive');
  });
});
