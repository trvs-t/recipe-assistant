export function scaleQuantity(
  quantity: number | null,
  originalServings: number,
  desiredServings: number,
): number | null {
  if (
    quantity === null ||
    !Number.isFinite(originalServings) ||
    originalServings <= 0 ||
    !Number.isFinite(desiredServings) ||
    desiredServings <= 0
  ) {
    return quantity;
  }

  return scaleQuantityByFactor(quantity, desiredServings / originalServings);
}

export function scaleQuantityByFactor(quantity: number | null, scaleFactor: number): number | null {
  if (quantity === null || !Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    return quantity;
  }

  return quantity * scaleFactor;
}

export function formatQuantity(quantity: number | null): string {
  if (quantity === null) {
    return 'to taste';
  }

  if (!Number.isFinite(quantity)) {
    return '—';
  }

  const roundedQuantity: number = roundQuantity(quantity);
  const roundedInteger: number = Math.round(roundedQuantity);
  if (Math.abs(roundedQuantity - roundedInteger) < 0.001) {
    return roundedInteger.toString();
  }

  const wholeNumber: number = Math.floor(roundedQuantity);
  const fractionalPart: number = roundedQuantity - wholeNumber;
  const closestFraction: IQuantityFraction | null = findClosestFraction(fractionalPart);

  if (closestFraction !== null) {
    const wholeLabel: string = wholeNumber === 0 ? '' : wholeNumber.toString();
    const fractionSeparator: string = wholeLabel !== '' && closestFraction.label.includes('/') ? ' ' : '';
    return `${wholeLabel}${fractionSeparator}${closestFraction.label}`;
  }

  return roundedQuantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatMeasurement(
  measurement: IIngredientMeasurement,
  scaleFactor: number = 1,
): string {
  const minimum: number = measurement.quantityMin * scaleFactor;
  const maximum: number = measurement.quantityMax * scaleFactor;
  const amount: string = Math.abs(minimum - maximum) < 0.0001
    ? formatQuantity(minimum)
    : `${formatQuantity(minimum)}–${formatQuantity(maximum)}`;
  return measurement.unit === null ? amount : `${amount} ${measurement.unit}`;
}

interface IQuantityFraction {
  label: string;
  value: number;
}

const COMMON_FRACTIONS: readonly IQuantityFraction[] = [
  { label: '½', value: 1 / 2 },
  { label: '⅓', value: 1 / 3 },
  { label: '⅔', value: 2 / 3 },
  { label: '¼', value: 1 / 4 },
  { label: '¾', value: 3 / 4 },
  { label: '⅕', value: 1 / 5 },
  { label: '⅖', value: 2 / 5 },
  { label: '⅗', value: 3 / 5 },
  { label: '⅘', value: 4 / 5 },
  { label: '⅙', value: 1 / 6 },
  { label: '⅚', value: 5 / 6 },
  { label: '⅛', value: 1 / 8 },
  { label: '⅜', value: 3 / 8 },
  { label: '⅝', value: 5 / 8 },
  { label: '⅞', value: 7 / 8 },
  { label: '1/16', value: 1 / 16 },
  { label: '3/16', value: 3 / 16 },
  { label: '5/16', value: 5 / 16 },
  { label: '7/16', value: 7 / 16 },
  { label: '9/16', value: 9 / 16 },
  { label: '11/16', value: 11 / 16 },
  { label: '13/16', value: 13 / 16 },
  { label: '15/16', value: 15 / 16 },
];

const QUANTITY_DISPLAY_DECIMAL_PLACES: number = 3;
const FRACTION_MATCH_TOLERANCE: number = 0.01;

function roundQuantity(quantity: number): number {
  const multiplier: number = 10 ** QUANTITY_DISPLAY_DECIMAL_PLACES;
  return Math.round((quantity + Number.EPSILON) * multiplier) / multiplier;
}

function findClosestFraction(fractionalPart: number): IQuantityFraction | null {
  let closestFraction: IQuantityFraction | null = null;
  let closestDistance: number = Number.POSITIVE_INFINITY;

  for (const fraction of COMMON_FRACTIONS) {
    const distance: number = Math.abs(fraction.value - fractionalPart);
    if (distance < closestDistance) {
      closestFraction = fraction;
      closestDistance = distance;
    }
  }

  return closestDistance <= FRACTION_MATCH_TOLERANCE ? closestFraction : null;
}
import type { IIngredientMeasurement } from './contracts';
