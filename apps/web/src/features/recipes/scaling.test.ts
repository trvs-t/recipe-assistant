import { describe, expect, it } from 'vitest';

import { formatMeasurement, formatQuantity, scaleQuantity, scaleQuantityByFactor } from './scaling';

describe('recipe scaling', (): void => {
  it('scales quantities with the original serving ratio', (): void => {
    expect(scaleQuantity(1.5, 2, 6)).toBe(4.5);
    expect(scaleQuantity(2, 4, 2)).toBe(1);
  });

  it('keeps non-numeric quantities as to taste', (): void => {
    expect(scaleQuantity(null, 2, 4)).toBeNull();
    expect(formatQuantity(null)).toBe('to taste');
    expect(formatQuantity(1.25)).toBe('1¼');
  });

  it('scales from an ingredient amount and formats floating point values cleanly', (): void => {
    expect(scaleQuantityByFactor(2, 1.5)).toBe(3);
    expect(scaleQuantityByFactor(1, 1.3333333333333333)).toBeCloseTo(4 / 3);
    expect(formatQuantity(0.3333333333333333)).toBe('⅓');
    expect(formatQuantity(2.6666666666666665)).toBe('2⅔');
    expect(formatQuantity(1.0625)).toBe('1 1/16');
    expect(formatQuantity(1.23456)).toBe('1.235');
  });

  it('formats equivalent measurements and preserves ranges', (): void => {
    expect(formatMeasurement({
      id: 'grams',
      quantityMin: 360,
      quantityMax: 480,
      unit: 'g',
      isPrimary: false,
      sortOrder: 1,
    })).toBe('360–480 g');
    expect(formatMeasurement({
      id: 'sticks',
      quantityMin: 2,
      quantityMax: 2,
      unit: 'sticks',
      isPrimary: false,
      sortOrder: 2,
    }, 2)).toBe('4 sticks');
  });
});
