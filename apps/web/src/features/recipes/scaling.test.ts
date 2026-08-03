import { describe, expect, it } from 'vitest';

import { formatQuantity, scaleQuantity } from './scaling';

describe('recipe scaling', (): void => {
  it('scales quantities with the original serving ratio', (): void => {
    expect(scaleQuantity(1.5, 2, 6)).toBe(4.5);
    expect(scaleQuantity(2, 4, 2)).toBe(1);
  });

  it('keeps non-numeric quantities as to taste', (): void => {
    expect(scaleQuantity(null, 2, 4)).toBeNull();
    expect(formatQuantity(null)).toBe('to taste');
    expect(formatQuantity(1.25)).toBe('1.25');
  });
});
