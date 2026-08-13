import type { Ingredient } from "./schemas";

export interface ScaledIngredient extends Ingredient {
  scaledQuantity: number | null;
  scaledMeasurements: readonly ScaledIngredientMeasurement[];
}

export interface ScaledIngredientMeasurement {
  quantityMin: number;
  quantityMax: number;
  unit: string | null;
  isPrimary: boolean;
  sortOrder: number;
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
    scaledMeasurements: ingredient.measurements.map((measurement) => ({
      ...measurement,
      quantityMin: measurement.quantityMin * scaleFactor,
      quantityMax: measurement.quantityMax * scaleFactor,
    })),
  };
}
