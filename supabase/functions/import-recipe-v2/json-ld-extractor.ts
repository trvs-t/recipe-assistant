import { type NormalizedRecipe, type RecipeIngredient } from "./types.ts";

export function extractRecipeFromJsonLd(
  html: string,
  source_url: string,
): NormalizedRecipe | null {
  const scripts: string[] = extractJsonLdScriptContents(html);
  for (const script of scripts) {
    const parsed: unknown = parseJson(script);
    if (parsed === null) {
      continue;
    }

    const candidates: Array<Record<string, unknown>> = [];
    collectRecipeCandidates(parsed, candidates);
    for (const candidate of candidates) {
      const recipe: NormalizedRecipe | null = buildRecipe(
        candidate,
        source_url,
      );
      if (recipe !== null) {
        return recipe;
      }
    }
  }

  return null;
}

function extractJsonLdScriptContents(html: string): string[] {
  const scripts: string[] = [];
  const scriptPattern: RegExp = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match: RegExpExecArray | null = scriptPattern.exec(html);

  while (match !== null) {
    const attributes: string = match[1] ?? "";
    const typeMatch: RegExpMatchArray | null = attributes.match(
      /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    );
    const scriptType: string = (
      typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? ""
    ).split(";")[0]?.trim().toLowerCase() ?? "";
    if (scriptType === "application/ld+json") {
      scripts.push(match[2] ?? "");
    }
    match = scriptPattern.exec(html);
  }

  return scripts;
}

function parseJson(value: string): unknown | null {
  const cleaned: string = value
    .replace(/^\s*<!--/, "")
    .replace(/-->\s*$/, "")
    .trim();
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return parsed;
  } catch {
    return null;
  }
}

function collectRecipeCandidates(
  value: unknown,
  candidates: Array<Record<string, unknown>>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRecipeCandidates(item, candidates);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (isRecipeType(value["@type"])) {
    candidates.push(value);
  }

  const graph: unknown = value["@graph"];
  if (graph !== undefined) {
    collectRecipeCandidates(graph, candidates);
  }
}

function isRecipeType(value: unknown): boolean {
  if (typeof value === "string") {
    return isRecipeTypeName(value);
  }
  if (Array.isArray(value)) {
    return value.some((item: unknown): boolean => isRecipeTypeName(item));
  }
  return false;
}

function isRecipeTypeName(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized: string = value.trim().toLowerCase();
  return normalized === "recipe" ||
    normalized.endsWith("/recipe") ||
    normalized.endsWith("#recipe");
}

function buildRecipe(
  candidate: Record<string, unknown>,
  source_url: string,
): NormalizedRecipe | null {
  const title: string = cleanText(asString(candidate["name"]) ?? "");
  const ingredientTexts: string[] = extractStringList(
    candidate["recipeIngredient"] ?? candidate["ingredients"],
  );
  const steps: string[] = extractInstructions(
    candidate["recipeInstructions"] ?? candidate["instructions"],
  );

  if (
    title.length === 0 || ingredientTexts.length === 0 || steps.length === 0
  ) {
    return null;
  }

  const ingredients: RecipeIngredient[] = ingredientTexts.map(
    (ingredient: string): RecipeIngredient => parseIngredient(ingredient),
  );
  const descriptionValue: string | null = asString(candidate["description"]);
  const image_url: string | null = extractImageUrl(candidate["image"]);

  return {
    title,
    description: descriptionValue === null ? null : cleanText(descriptionValue),
    ingredients,
    steps,
    servings: parseServingCount(candidate["recipeYield"]),
    prep_time_minutes: parseDurationMinutes(candidate["prepTime"]),
    cook_time_minutes: parseDurationMinutes(candidate["cookTime"]),
    image_url,
    source_url,
  };
}

function extractStringList(value: unknown): string[] {
  if (typeof value === "string") {
    const cleaned: string = cleanText(value);
    return cleaned.length > 0 ? [cleaned] : [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const values: string[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const cleaned: string = cleanText(item);
      if (cleaned.length > 0) {
        values.push(cleaned);
      }
      continue;
    }

    if (isRecord(item)) {
      const text: string | null = asString(item["text"]) ??
        asString(item["name"]);
      if (text !== null && cleanText(text).length > 0) {
        values.push(cleanText(text));
      }
    }
  }
  return values;
}

function extractInstructions(value: unknown): string[] {
  if (typeof value === "string") {
    const cleaned: string = cleanText(value);
    return cleaned.length > 0 ? [cleaned] : [];
  }

  if (Array.isArray(value)) {
    const steps: string[] = [];
    for (const item of value) {
      steps.push(...extractInstructions(item));
    }
    return steps;
  }

  if (!isRecord(value)) {
    return [];
  }

  const text: string | null = asString(value["text"]);
  if (text !== null && cleanText(text).length > 0) {
    return [cleanText(text)];
  }

  return extractInstructions(
    value["itemListElement"] ?? value["steps"] ?? value["recipeInstructions"],
  );
}

function parseIngredient(value: string): RecipeIngredient {
  const original: string = cleanText(value);
  const match: RegExpMatchArray | null = original.match(
    /^((?:\d+\s+)?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?(?:\s*-\s*(?:\d+\s+)?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)?)\s+(.+)$/,
  );

  if (match === null) {
    return {
      original,
      quantity: null,
      unit: null,
      name: original,
      notes: null,
    };
  }

  const quantity: number | null = parseQuantity(match[1] ?? "");
  const remainder: string = cleanText(match[2] ?? original);
  const remainderParts: string[] = remainder.split(" ");
  const firstWord: string = (remainderParts[0] ?? "").toLowerCase();
  const unit: string | null = RECIPE_UNITS.has(firstWord) ? firstWord : null;
  const name: string = unit === null
    ? remainder
    : cleanText(remainderParts.slice(1).join(" "));
  return {
    original,
    quantity,
    unit,
    name,
    notes: null,
  };
}

const RECIPE_UNITS: ReadonlySet<string> = new Set<string>([
  "cup",
  "cups",
  "tbsp",
  "tbs",
  "tablespoon",
  "tablespoons",
  "tsp",
  "teaspoon",
  "teaspoons",
  "oz",
  "ounce",
  "ounces",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "g",
  "gm",
  "gms",
  "gram",
  "grams",
  "kg",
  "kilogram",
  "kilograms",
  "ml",
  "milliliter",
  "milliliters",
  "l",
  "liter",
  "liters",
  "clove",
  "cloves",
  "can",
  "cans",
  "package",
  "packages",
  "pinch",
  "pinches",
  "dash",
  "dashes",
  "sprig",
  "sprigs",
  "slice",
  "slices",
  "large",
  "medium",
  "small",
]);

function parseQuantity(value: string): number | null {
  const normalized: string = value.replace(/\s+/g, " ").trim();
  if (normalized.includes("-")) {
    const rangeParts: string[] = normalized.split("-");
    const first: number | null = parseQuantity(rangeParts[0] ?? "");
    const second: number | null = parseQuantity(rangeParts[1] ?? "");
    if (first !== null && second !== null) {
      return (first + second) / 2;
    }
    return null;
  }

  if (normalized.includes(" ")) {
    const mixedParts: string[] = normalized.split(" ");
    const whole: number = Number(mixedParts[0]);
    const fraction: number | null = parseQuantity(
      mixedParts.slice(1).join(" "),
    );
    if (Number.isFinite(whole) && fraction !== null) {
      return whole + fraction;
    }
  }

  if (normalized.includes("/")) {
    const fractionParts: string[] = normalized.split("/");
    const numerator: number = Number(fractionParts[0]);
    const denominator: number = Number(fractionParts[1]);
    if (
      Number.isFinite(numerator) && Number.isFinite(denominator) &&
      denominator !== 0
    ) {
      return numerator / denominator;
    }
    return null;
  }

  const numberValue: number = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseServingCount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const match: RegExpMatchArray | null = value.match(/\d+(?:\.\d+)?/);
  if (match === null) {
    return null;
  }
  const servings: number = Number(match[0]);
  return Number.isFinite(servings) && servings > 0 ? servings : null;
}

function parseDurationMinutes(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const isoMatch: RegExpMatchArray | null = value.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
  );
  if (isoMatch !== null) {
    const days: number = Number(isoMatch[1] ?? 0);
    const hours: number = Number(isoMatch[2] ?? 0);
    const minutes: number = Number(isoMatch[3] ?? 0);
    const seconds: number = Number(isoMatch[4] ?? 0);
    return days * 24 * 60 + hours * 60 + minutes + seconds / 60;
  }

  const hourMatch: RegExpMatchArray | null = value.match(
    /(\d+(?:\.\d+)?)\s*h/i,
  );
  const minuteMatch: RegExpMatchArray | null = value.match(
    /(\d+(?:\.\d+)?)\s*m/i,
  );
  if (hourMatch === null && minuteMatch === null) {
    return null;
  }
  const hours: number = Number(hourMatch?.[1] ?? 0);
  const minutes: number = Number(minuteMatch?.[1] ?? 0);
  return hours * 60 + minutes;
}

function extractImageUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value.trim() : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const image: string | null = extractImageUrl(item);
      if (image !== null) {
        return image;
      }
    }
    return null;
  }
  if (isRecord(value)) {
    return extractImageUrl(value["url"] ?? value["contentUrl"]);
  }
  return null;
}

function cleanText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
