import { PipelineError } from "./errors.ts";
import {
  type AiNormalizationAdapter,
  type AiNormalizationInput,
  type IngredientMeasurement,
  type NormalizedRecipe,
  type NormalizedRecipeDraft,
  type NormalizedRecipeStep,
  type RecipeIngredient,
} from "./types.ts";

export function normalizeRecipeDraft(
  draft: unknown,
  source_url: string | null,
): NormalizedRecipe {
  if (!isRecord(draft)) {
    throw invalidOutput("AI normalization returned a non-object result");
  }

  const title: string | null = nonEmptyString(draft["title"]);
  const stepResult: StepArrayResult | null = stepsArray(draft["steps"]);
  const ingredients: readonly RecipeIngredient[] | null = ingredientsArray(
    draft["ingredients"],
  );

  if (
    title === null ||
    stepResult === null ||
    stepResult.texts.length === 0 ||
    ingredients === null ||
    ingredients.length === 0
  ) {
    throw invalidOutput("AI normalization returned an incomplete recipe");
  }

  const images: readonly string[] | undefined = imagesArray(draft["images"]);
  const dietary_tags: readonly string[] | undefined = optionalStringArray(
    draft["dietaryTags"] ?? draft["dietary_tags"],
  );
  const status: "draft" | "ready" | "needs_review" | undefined = optionalStatus(
    draft["status"],
  );
  const description: string | null = optionalNullableString(
    draft["description"],
    "description",
  );
  const servings: number | null = optionalNumber(
    draft["servings"],
    0,
    undefined,
    "servings",
  );
  const prep_time_minutes: number | null = optionalNumber(
    draft["prepTimeMinutes"] ?? draft["prep_time_minutes"],
    0,
    undefined,
    "prepTimeMinutes",
  );
  const cook_time_minutes: number | null = optionalNumber(
    draft["cookTimeMinutes"] ?? draft["cook_time_minutes"],
    0,
    undefined,
    "cookTimeMinutes",
  );
  const total_time_minutes: number | null = optionalNumber(
    draft["totalTimeMinutes"] ?? draft["total_time_minutes"],
    0,
    undefined,
    "totalTimeMinutes",
  );
  const parse_confidence: number | null = optionalNumber(
    draft["parseConfidence"] ?? draft["parse_confidence"],
    0,
    1,
    "parseConfidence",
  );
  const cuisine_type: string | null = optionalNullableString(
    draft["cuisineType"] ?? draft["cuisine_type"],
    "cuisineType",
  );

  return {
    title,
    description,
    ingredients,
    steps: stepResult.texts,
    servings,
    prep_time_minutes,
    cook_time_minutes,
    image_url: optionalNullableString(
      draft["image_url"] ?? draft["imageUrl"],
      "image_url",
    ),
    source_url,
    ...(images === undefined ? {} : { images }),
    ...(dietary_tags === undefined ? {} : { dietary_tags }),
    ...(stepResult.details === undefined
      ? {}
      : { step_details: stepResult.details }),
    ...(cuisine_type === null ? {} : { cuisine_type }),
    ...(total_time_minutes === null ? {} : { total_time_minutes }),
    ...(parse_confidence === null ? {} : { parse_confidence }),
    ...(status === undefined ? {} : { status }),
  };
}

export function normalizeIngredientDrafts(
  value: unknown,
): readonly RecipeIngredient[] {
  if (!isRecord(value)) {
    throw invalidOutput(
      "AI ingredient normalization returned a non-object result",
    );
  }
  const ingredients: readonly RecipeIngredient[] | null = ingredientsArray(
    value["ingredients"],
  );
  if (ingredients === null || ingredients.length === 0) {
    throw invalidOutput("AI ingredient normalization returned no ingredients");
  }
  return ingredients;
}

export function createUnavailableAiNormalizer(): AiNormalizationAdapter {
  return {
    normalize(_input: AiNormalizationInput): Promise<NormalizedRecipeDraft> {
      return Promise.reject(
        new PipelineError({
          code: "AI_NORMALIZER_NOT_CONFIGURED",
          message: "No AI normalization adapter has been configured",
          stage: "normalize",
          retryable: false,
        }),
      );
    },
  };
}

function invalidOutput(message: string): PipelineError {
  return new PipelineError({
    code: "RECIPE_OUTPUT_INVALID",
    message,
    stage: "normalize",
    retryable: false,
  });
}

function ingredientsArray(value: unknown): readonly RecipeIngredient[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ingredients: RecipeIngredient[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }

    const name: string | null = nonEmptyString(item["name"]);
    if (name === null) {
      return null;
    }

    const original: string = strictOptionalString(
      item["originalText"] ?? item["original"],
      "originalText",
    ) ?? name;
    const quantity: number | null = strictNullableNumber(
      item["quantity"],
      Number.MIN_VALUE,
      "quantity",
    );
    const unit: string | null = strictNullableString(item["unit"], "unit");
    const notes: string | null = strictNullableString(item["notes"], "notes");
    const measurements: readonly IngredientMeasurement[] | undefined =
      measurementsArray(item["measurements"]);
    const id: string | undefined = optionalNonEmptyString(item["id"], "id");
    const sort_order: number | undefined = optionalNonNegativeInteger(
      item["sortOrder"] ?? item["sort_order"],
    );
    ingredients.push({
      ...(id === undefined ? {} : { id }),
      original,
      quantity,
      unit,
      name,
      notes,
      ...(measurements === undefined ? {} : { measurements }),
      ...(sort_order === undefined ? {} : { sort_order }),
    });
  }

  return ingredients;
}

function measurementsArray(
  value: unknown,
): readonly IngredientMeasurement[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw invalidOutput(
      "AI normalization returned invalid ingredient measurements",
    );
  }
  return value.map((item: unknown): IngredientMeasurement => {
    if (!isRecord(item)) {
      throw invalidOutput(
        "AI normalization returned an invalid ingredient measurement",
      );
    }
    const quantity_min: number | null = strictNullableNumber(
      item["quantityMin"] ?? item["quantity_min"],
      Number.MIN_VALUE,
      "measurement quantityMin",
    );
    const quantity_max: number | null = strictNullableNumber(
      item["quantityMax"] ?? item["quantity_max"],
      Number.MIN_VALUE,
      "measurement quantityMax",
    );
    if (
      quantity_min === null || quantity_max === null ||
      quantity_max < quantity_min
    ) {
      throw invalidOutput(
        "AI normalization returned an invalid ingredient measurement range",
      );
    }
    const isPrimary: unknown = item["isPrimary"] ?? item["is_primary"];
    if (typeof isPrimary !== "boolean") {
      throw invalidOutput(
        "AI normalization returned an invalid primary measurement flag",
      );
    }
    return {
      quantity_min,
      quantity_max,
      unit: strictNullableString(item["unit"], "measurement unit"),
      is_primary: isPrimary,
    };
  });
}

interface StepArrayResult {
  readonly texts: readonly string[];
  readonly details?: readonly NormalizedRecipeStep[];
}

function stepsArray(value: unknown): StepArrayResult | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values: string[] = [];
  const details: NormalizedRecipeStep[] = [];
  let hasStructuredSteps: boolean = false;
  for (const item of value) {
    if (typeof item === "string") {
      const text: string | null = nonEmptyString(item);
      if (text === null) {
        return null;
      }
      values.push(text);
      continue;
    }

    if (!isRecord(item)) {
      return null;
    }

    const instruction: string | null = nonEmptyString(item["instruction"]) ??
      nonEmptyString(item["text"]);
    if (instruction === null) {
      return null;
    }

    const id: string | undefined = optionalNonEmptyString(item["id"], "id");
    const sort_order: number | undefined = optionalNonNegativeInteger(
      item["sortOrder"] ?? item["sort_order"],
    );
    const timer_duration_minutes: number | null = strictNullableNumber(
      item["timerDurationMinutes"] ?? item["timer_duration_minutes"],
      0,
      "timerDurationMinutes",
    );
    details.push({
      ...(id === undefined ? {} : { id }),
      instruction,
      timer_duration_minutes,
      ...(sort_order === undefined ? {} : { sort_order }),
    });
    values.push(instruction);
    hasStructuredSteps = true;
  }

  return {
    texts: values,
    ...(hasStructuredSteps ? { details } : {}),
  };
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed: string = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalNullableString(
  value: unknown,
  field_name: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const text: string | null = nonEmptyString(value);
  if (text === null) {
    throw invalidOutput(`AI normalization returned an invalid ${field_name}`);
  }
  return text;
}

function optionalNumber(
  value: unknown,
  minimum: number,
  maximum: number | undefined,
  field_name: string,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    (maximum !== undefined && value > maximum)
  ) {
    throw invalidOutput(`AI normalization returned an invalid ${field_name}`);
  }
  return value;
}

function optionalStatus(
  value: unknown,
): "draft" | "ready" | "needs_review" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "draft" || value === "ready" || value === "needs_review") {
    return value;
  }
  throw invalidOutput("AI normalization returned an invalid status");
}

function optionalNonEmptyString(
  value: unknown,
  field_name: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text: string | null = nonEmptyString(value);
  if (text === null) {
    throw invalidOutput(`AI normalization returned an invalid ${field_name}`);
  }
  return text;
}

function strictOptionalString(
  value: unknown,
  field_name: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const text: string | null = nonEmptyString(value);
  if (text === null) {
    throw invalidOutput(`AI normalization returned an invalid ${field_name}`);
  }
  return text;
}

function strictNullableString(
  value: unknown,
  field_name: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw invalidOutput(`AI normalization returned an invalid ${field_name}`);
  }
  const trimmed: string = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function strictNullableNumber(
  value: unknown,
  minimum: number,
  field_name: string,
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw invalidOutput(`AI normalization returned an invalid ${field_name}`);
  }
  return value;
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw invalidOutput("AI normalization returned an invalid sort order");
  }
  return value;
}

function imagesArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw invalidOutput("AI normalization returned invalid images");
  }

  const images: string[] = [];
  for (const item of value) {
    const image: string | null = nonEmptyString(item);
    if (image === null) {
      throw invalidOutput("AI normalization returned an invalid image URL");
    }
    images.push(image);
  }
  return images;
}

function optionalStringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw invalidOutput("AI normalization returned an invalid string list");
  }

  const values: string[] = [];
  for (const item of value) {
    const text: string | null = nonEmptyString(item);
    if (text === null) {
      throw invalidOutput(
        "AI normalization returned an invalid string list item",
      );
    }
    values.push(text);
  }
  return values;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
