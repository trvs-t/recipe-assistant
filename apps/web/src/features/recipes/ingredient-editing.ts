import type { IIngredientEditInput, IRecipeIngredient } from './contracts';

export interface IIngredientFormValues {
  name: string;
  amount: string;
  unit: string;
  note: string;
}

export interface IParsedIngredientForm {
  input: IIngredientEditInput | null;
  error: string | null;
}

export function ingredientToFormValues(ingredient: IRecipeIngredient): IIngredientFormValues {
  return {
    name: ingredient.name,
    amount: ingredient.quantity === null ? '' : ingredient.quantity.toString(),
    unit: ingredient.unit ?? '',
    note: ingredient.note ?? '',
  };
}

export function variationToFormValues(ingredient: IRecipeIngredient): IIngredientFormValues {
  return {
    ...ingredientToFormValues(ingredient),
    name: `${ingredient.name} alternative`,
  };
}

export function parseIngredientFormValues(values: IIngredientFormValues): IParsedIngredientForm {
  const name: string = values.name.trim();
  if (name.length === 0) {
    return { input: null, error: 'Add an ingredient name.' };
  }

  const amount: string = values.amount.trim();
  const quantity: number | null = amount.length === 0 ? null : Number(amount);
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
    return { input: null, error: 'Amount must be a positive number, or leave it blank for to taste.' };
  }

  return {
    input: {
      name,
      quantity,
      unit: nullableText(values.unit),
      note: nullableText(values.note),
    },
    error: null,
  };
}

function nullableText(value: string): string | null {
  const trimmedValue: string = value.trim();
  return trimmedValue.length === 0 ? null : trimmedValue;
}
