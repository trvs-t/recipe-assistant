export function scaleQuantity(
  quantity: number | null,
  originalServings: number,
  desiredServings: number,
): number | null {
  if (quantity === null || originalServings <= 0 || desiredServings <= 0) {
    return quantity;
  }

  return quantity * (desiredServings / originalServings);
}

export function formatQuantity(quantity: number | null): string {
  if (quantity === null) {
    return 'to taste';
  }

  if (Number.isInteger(quantity)) {
    return quantity.toString();
  }

  return quantity.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
