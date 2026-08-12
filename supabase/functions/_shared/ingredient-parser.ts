export interface ParsedIngredient {
  quantity: number | null;
  unit: string | null;
  name: string;
  original_text: string;
}

const UNIT_PATTERN = [
  "cups?",
  "tablespoons?",
  "tbsp?",
  "teaspoons?",
  "tsp?",
  "ounces?",
  "oz",
  "pounds?",
  "lbs?",
  "grams?",
  "g",
  "kilograms?",
  "kg",
  "milliliters?",
  "ml",
  "liters?",
  "l",
  "cloves?",
  "heads?",
  "bunches?",
  "sprigs?",
  "slices?",
  "pinch(?:es)?",
  "dash(?:es)?",
  "handfuls?",
  "cans?",
  "packages?",
  "sticks?",
  "pieces?",
  "large",
  "medium",
  "small",
].join("|");

const QUANTITY_PATTERN = "(\\d+(?:\\.\\d+)?(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+)";
const INGREDIENT_PATTERN = new RegExp(
  `^${QUANTITY_PATTERN}(?:\\s*[-–]\\s*${QUANTITY_PATTERN})?\\s+(.+)$`,
  "i",
);
const UNIT_AND_NAME_PATTERN = new RegExp(
  `^(${UNIT_PATTERN})(?:\\s+|$)(.*)$`,
  "i",
);

export function parseIngredient(text: string): ParsedIngredient {
  const originalText = text.trim();
  const ingredientMatch = originalText.match(INGREDIENT_PATTERN);

  if (ingredientMatch === null) {
    return createFallback(originalText);
  }

  const lowerQuantity = parseQuantity(ingredientMatch[1]);
  const upperQuantity = ingredientMatch[2] === undefined
    ? null
    : parseQuantity(ingredientMatch[2]);
  const quantity = lowerQuantity === null
    ? null
    : upperQuantity === null
    ? lowerQuantity
    : (lowerQuantity + upperQuantity) / 2;
  const remainder = ingredientMatch[3].trim();

  if (quantity === null || remainder.length === 0) {
    return createFallback(originalText);
  }

  const unitMatch = remainder.match(UNIT_AND_NAME_PATTERN);
  const unit = unitMatch?.[1] ?? null;
  const name = (unitMatch?.[2] ?? remainder).trim();

  if (name.length === 0) {
    return createFallback(originalText);
  }

  return {
    quantity,
    unit,
    name,
    original_text: originalText,
  };
}

function parseQuantity(value: string): number | null {
  const normalized = value.trim();
  const mixedParts = normalized.split(/\s+/);
  let quantity: number;

  if (mixedParts.length === 2) {
    const whole = Number(mixedParts[0]);
    const fraction = parseFraction(mixedParts[1]);
    quantity = fraction === null ? Number.NaN : whole + fraction;
  } else if (normalized.includes("/")) {
    quantity = parseFraction(normalized) ?? Number.NaN;
  } else {
    quantity = Number(normalized);
  }

  return Number.isFinite(quantity) ? quantity : null;
}

function parseFraction(value: string): number | null {
  const [numeratorText, denominatorText] = value.split("/");
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);

  if (
    !Number.isFinite(numerator) || !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }

  return numerator / denominator;
}

function createFallback(originalText: string): ParsedIngredient {
  return {
    quantity: null,
    unit: null,
    name: originalText,
    original_text: originalText,
  };
}
