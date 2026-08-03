import type { Ingredient } from "./schemas";

export interface ScaledIngredient extends Ingredient {
  scaledQuantity: number | null;
}

export function calculateScaleFactor(
  originalServings: number,
  desiredServings: number,
): number {
  if (!Number.isFinite(originalServings) || originalServings <= 0) {
    throw new RangeError("Original servings must be a positive number");
  }
  if (!Number.isFinite(desiredServings) || desiredServings <= 0) {
    throw new RangeError("Desired servings must be a positive number");
  }

  return desiredServings / originalServings;
}

export function scaleIngredient(
  ingredient: Ingredient,
  scaleFactor: number,
): ScaledIngredient {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    throw new RangeError("Scale factor must be a positive number");
  }

  return {
    ...ingredient,
    scaledQuantity: ingredient.quantity === null
      ? null
      : ingredient.quantity * scaleFactor,
  };
}
