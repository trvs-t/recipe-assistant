import { PipelineError } from "./errors.ts";
import { parseIngredientLinkOutput } from "./ingredient-linker.ts";
import {
  normalizeIngredientDrafts,
  normalizeRecipeDraft,
} from "./ai-normalizer.ts";
import {
  type AiNormalizationAdapter,
  type AiNormalizationInput,
  type IngredientLinkingAdapter,
  type IngredientLinkingInput,
  type IngredientNormalizationAdapter,
  type IngredientNormalizationInput,
  type IngredientNormalizationResult,
  type NormalizedRecipeDraft,
  type RecipeFlow,
  type RecipeIngredient,
} from "./types.ts";

export const OPENROUTER_MODEL: string = "deepseek/deepseek-v4-flash";
export const OPENROUTER_ENDPOINT: string =
  "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_TIMEOUT_MS: number = 30_000;
export const OPENROUTER_INLINE_ATTEMPTS: number = 2;
export const OPENROUTER_CONTENT_LIMIT: number = 15_000;

export interface OpenRouterTransport {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export const defaultOpenRouterTransport: OpenRouterTransport = {
  fetch(input: string, init: RequestInit): Promise<Response> {
    return fetch(input, init);
  },
};

export interface OpenRouterNormalizerOptions {
  readonly api_key: string;
  readonly model: string;
  readonly endpoint?: string;
  readonly timeout_ms?: number;
  readonly max_tokens?: number;
  readonly max_inline_attempts?: number;
  readonly transport?: OpenRouterTransport;
  readonly site_url?: string;
  readonly site_name?: string;
}

export class OpenRouterNormalizer
  implements
    AiNormalizationAdapter,
    IngredientLinkingAdapter,
    IngredientNormalizationAdapter {
  private readonly api_key: string;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly timeout_ms: number;
  private readonly max_tokens: number;
  private readonly max_inline_attempts: number;
  private readonly transport: OpenRouterTransport;
  private readonly site_url: string | undefined;
  private readonly site_name: string | undefined;

  constructor(options: OpenRouterNormalizerOptions) {
    this.api_key = options.api_key.trim();
    this.model = options.model.trim();
    this.endpoint = options.endpoint ?? OPENROUTER_ENDPOINT;
    this.timeout_ms = positiveInteger(
      options.timeout_ms,
      OPENROUTER_TIMEOUT_MS,
    );
    this.max_tokens = positiveInteger(options.max_tokens, 4096);
    this.max_inline_attempts = positiveInteger(
      options.max_inline_attempts,
      OPENROUTER_INLINE_ATTEMPTS,
    );
    this.transport = options.transport ?? defaultOpenRouterTransport;
    this.site_url = options.site_url;
    this.site_name = options.site_name;

    if (this.api_key.length === 0) {
      throw new Error("OPENROUTER_API_KEY is required");
    }
    if (this.model.length === 0) {
      throw new Error("OPENROUTER_MODEL is required");
    }
  }

  async normalize(input: AiNormalizationInput): Promise<NormalizedRecipeDraft> {
    let lastError: PipelineError | null = null;
    for (
      let inline_attempt: number = 1;
      inline_attempt <= this.max_inline_attempts;
      inline_attempt += 1
    ) {
      try {
        return await this.normalizeOnce(input, inline_attempt);
      } catch (error) {
        if (!(error instanceof PipelineError) || !shouldRetryInline(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    if (lastError !== null) {
      throw new PipelineError({
        code: lastError.code,
        message: lastError.message,
        stage: "normalize",
        retryable: true,
        details: {
          ...lastError.details,
          inline_attempts: this.max_inline_attempts,
        },
      });
    }
    throw invalidAiResponse(
      "OpenRouter did not return a usable recipe payload",
    );
  }

  async link(input: IngredientLinkingInput): Promise<RecipeFlow | null> {
    const response: Response = await this.requestIngredientLinks(input);
    const responseText: string = await readResponseText(
      response,
      this.timeout_ms,
    );
    const responseBody: unknown = parseResponseJson(responseText);
    const content: string = extractMessageContent(responseBody);
    let linkOutput: unknown;
    try {
      linkOutput = JSON.parse(extractJsonObjectText(content));
    } catch {
      throw invalidAiResponse(
        "OpenRouter returned ingredient links that are not strict JSON",
      );
    }
    return parseIngredientLinkOutput(linkOutput, input);
  }

  async normalizeIngredients(
    input: IngredientNormalizationInput,
  ): Promise<IngredientNormalizationResult> {
    const response: Response = await this.requestIngredientNormalization(input);
    const responseText: string = await readResponseText(
      response,
      this.timeout_ms,
    );
    const responseBody: unknown = parseResponseJson(responseText);
    const content: string = extractMessageContent(responseBody);
    let output: unknown;
    try {
      output = JSON.parse(extractJsonObjectText(content));
    } catch {
      throw invalidAiResponse(
        "OpenRouter returned ingredient normalization that is not strict JSON",
      );
    }
    const ingredients: readonly RecipeIngredient[] = normalizeIngredientDrafts(
      output,
    );
    if (
      ingredients.length !== input.ingredients.length ||
      ingredients.some((ingredient: RecipeIngredient, index: number): boolean =>
        ingredient.original !== input.ingredients[index]
      )
    ) {
      throw invalidAiResponse(
        "OpenRouter changed or omitted source ingredients",
      );
    }
    const normalizedIngredients: readonly RecipeIngredient[] = ingredients.map(
      (ingredient: RecipeIngredient, index: number): RecipeIngredient => {
        const suppliedMeasurements = ingredient.measurements ?? [];
        const requestedPrimaryIndex: number = suppliedMeasurements.findIndex(
          (measurement): boolean => measurement.is_primary,
        );
        const primaryIndex: number = requestedPrimaryIndex < 0
          ? 0
          : requestedPrimaryIndex;
        const measurements = suppliedMeasurements.map((
          measurement,
          measurementIndex,
        ) => ({
          ...measurement,
          is_primary: measurementIndex === primaryIndex,
        }));
        const primary = measurements[primaryIndex];
        return {
          ...ingredient,
          id: `ingredient:${index}`,
          quantity: primary?.quantity_min ?? ingredient.quantity,
          unit: primary?.unit ?? ingredient.unit,
          measurements,
          sort_order: index,
        };
      },
    );
    const linkingInput: IngredientLinkingInput = {
      ingredients: normalizedIngredients.map((ingredient, index) => ({
        id: ingredient.id ?? `ingredient:${index}`,
        originalText: ingredient.original,
        name: ingredient.name,
      })),
      steps: input.steps ?? [],
    };
    return {
      ingredients: normalizedIngredients,
      flow: parseIngredientLinkOutput(
        { links: isRecord(output) ? output["ingredientLinks"] : undefined },
        linkingInput,
      ),
    };
  }

  private async normalizeOnce(
    input: AiNormalizationInput,
    inline_attempt: number,
  ): Promise<NormalizedRecipeDraft> {
    const response: Response = await this.request(input, inline_attempt);
    const responseText: string = await readResponseText(
      response,
      this.timeout_ms,
    );
    const responseBody: unknown = parseResponseJson(responseText);
    const content: string = extractMessageContent(responseBody);
    let normalizedOutput: unknown;
    try {
      normalizedOutput = JSON.parse(extractJsonObjectText(content));
    } catch {
      throw invalidAiResponse(
        "OpenRouter returned content that is not strict JSON",
      );
    }

    return normalizeRecipeDraft(normalizedOutput, input.source_url);
  }

  private async request(
    input: AiNormalizationInput,
    inline_attempt: number,
  ): Promise<Response> {
    const controller: AbortController = new AbortController();
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.api_key}`,
      "content-type": "application/json",
    };
    if (this.site_url !== undefined && this.site_url.trim().length > 0) {
      headers["http-referer"] = this.site_url;
    }
    if (this.site_name !== undefined && this.site_name.trim().length > 0) {
      headers["x-title"] = this.site_name;
    }

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.max_tokens,
      temperature: 0,
      reasoning: {
        effort: "none",
      },
      provider: {
        require_parameters: true,
      },
      response_format: responseFormat(inline_attempt),
      messages: [
        {
          role: "system",
          content:
            "Extract one recipe from the supplied source and return only JSON. Required top-level keys: title, description, ingredients, steps, ingredientLinks, servings, prepTimeMinutes, cookTimeMinutes, totalTimeMinutes, images, cuisineType, dietaryTags, parseConfidence, status. Each ingredient requires id, originalText, quantity, unit, name, notes, measurements, sortOrder. Preserve every explicitly supplied equivalent measurement and range; never calculate conversions. quantity and unit mirror the first primary measurement. Each step requires id, instruction, timerDurationMinutes, sortOrder. ingredientLinks links each step to the ingredient IDs it explicitly uses; never create IDs or infer a missing ingredient, and use confidence from 0 to 1. Do not invent ingredients or steps. Every explicit ingredient quantity must be greater than zero; use null only when the source truly omits a quantity. Use null when another scalar is unavailable.",
        },
        {
          role: "user",
          content: [
            `Requested source URL: ${input.source_url ?? "Pasted recipe text"}`,
            `Resolved source URL: ${
              input.resolved_url ?? "Pasted recipe text"
            }`,
            `Normalization attempt: ${inline_attempt} of ${this.max_inline_attempts}`,
            "Recipe source content:",
            prepareRecipeSourceContent(input.content),
          ].join("\n\n"),
        },
      ],
    };

    try {
      const response: Response = await fetchWithTimeout(
        this.transport,
        this.endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        },
        controller,
        this.timeout_ms,
      );

      if (response.ok) {
        return response;
      }

      const errorText: string = await readResponseText(
        response,
        this.timeout_ms,
      );
      throw new PipelineError({
        code: "AI_NORMALIZATION_FAILED",
        message: `OpenRouter returned HTTP ${response.status}`,
        stage: "normalize",
        retryable: isRetryableStatus(response.status),
        details: {
          status: response.status,
          reason: errorText.slice(0, 300),
        },
      });
    } catch (error) {
      if (error instanceof PipelineError) {
        throw error;
      }
      throw new PipelineError({
        code: "AI_NORMALIZATION_FAILED",
        message: "OpenRouter could not be reached",
        stage: "normalize",
        retryable: true,
        details: {
          reason: error instanceof Error ? error.message : "AI request failed",
        },
      });
    }
  }

  private async requestIngredientLinks(
    input: IngredientLinkingInput,
  ): Promise<Response> {
    const controller: AbortController = new AbortController();
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.api_key}`,
      "content-type": "application/json",
    };
    if (this.site_url !== undefined && this.site_url.trim().length > 0) {
      headers["http-referer"] = this.site_url;
    }
    if (this.site_name !== undefined && this.site_name.trim().length > 0) {
      headers["x-title"] = this.site_name;
    }

    const deterministicHint: string = input.deterministic_flow === undefined
      ? "No deterministic links were found."
      : JSON.stringify(input.deterministic_flow);
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 1_600,
      temperature: 0,
      reasoning: { effort: "none" },
      provider: { require_parameters: true },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ingredient_linking",
          strict: true,
          schema: INGREDIENT_LINKING_SCHEMA,
        },
      },
      messages: [
        {
          role: "system",
          content:
            "Link recipe steps to the ingredient IDs they explicitly use. Return only JSON. Never create IDs, never infer a missing ingredient, and use confidence from 0 to 1. Only links at or above 0.7 will be saved.",
        },
        {
          role: "user",
          content: [
            "Ingredients:",
            JSON.stringify(input.ingredients),
            "Steps:",
            JSON.stringify(input.steps),
            "Deterministic links are hints; preserve them and add only safe missing links:",
            deterministicHint,
          ].join("\n\n"),
        },
      ],
    };

    try {
      const response: Response = await fetchWithTimeout(
        this.transport,
        this.endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        },
        controller,
        this.timeout_ms,
      );

      if (response.ok) {
        return response;
      }

      const errorText: string = await readResponseText(
        response,
        this.timeout_ms,
      );
      throw new PipelineError({
        code: "AI_NORMALIZATION_FAILED",
        message:
          `OpenRouter ingredient linking returned HTTP ${response.status}`,
        stage: "normalize",
        retryable: isRetryableStatus(response.status),
        details: {
          status: response.status,
          reason: errorText.slice(0, 300),
        },
      });
    } catch (error) {
      if (error instanceof PipelineError) {
        throw error;
      }
      throw new PipelineError({
        code: "AI_NORMALIZATION_FAILED",
        message: "OpenRouter could not be reached for ingredient linking",
        stage: "normalize",
        retryable: true,
        details: {
          reason: error instanceof Error ? error.message : "AI request failed",
        },
      });
    }
  }

  private async requestIngredientNormalization(
    input: IngredientNormalizationInput,
  ): Promise<Response> {
    const controller: AbortController = new AbortController();
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 2_400,
      temperature: 0,
      reasoning: { effort: "none" },
      provider: { require_parameters: true },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ingredient_normalization",
          strict: true,
          schema: INGREDIENT_NORMALIZATION_SCHEMA,
        },
      },
      messages: [
        {
          role: "system",
          content: [
            "Normalize recipe ingredient strings and link them to recipe steps. Return only JSON.",
            "Preserve originalText exactly and preserve input order.",
            "Separate the ingredient name, preparation notes, and every explicitly supplied measurement.",
            "Equivalent measures such as 228 g (1 cup or 2 sticks) are separate measurements of one ingredient.",
            "Represent ranges with quantityMin and quantityMax; do not average them.",
            "Never calculate conversions or invent quantities, units, ingredients, or notes.",
            "Use the first source measurement as primary. quantity and unit must mirror its quantityMin and unit.",
            "ingredientLinks links each supplied step to the ingredient IDs it explicitly uses. Never create IDs, infer missing ingredients, or link below 0.7 confidence. Return an empty ingredientLinks array when no steps are supplied.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            ingredients: input.ingredients,
            steps: input.steps ?? [],
          }),
        },
      ],
    };
    return this.requestJson(body, controller, "ingredient normalization");
  }

  private async requestJson(
    body: Readonly<Record<string, unknown>>,
    controller: AbortController,
    operation: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.api_key}`,
      "content-type": "application/json",
    };
    if (this.site_url !== undefined && this.site_url.trim().length > 0) {
      headers["http-referer"] = this.site_url;
    }
    if (this.site_name !== undefined && this.site_name.trim().length > 0) {
      headers["x-title"] = this.site_name;
    }
    try {
      const response: Response = await fetchWithTimeout(
        this.transport,
        this.endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        },
        controller,
        this.timeout_ms,
      );
      if (response.ok) {
        return response;
      }
      const errorText: string = await readResponseText(
        response,
        this.timeout_ms,
      );
      throw new PipelineError({
        code: "AI_NORMALIZATION_FAILED",
        message: `OpenRouter ${operation} returned HTTP ${response.status}`,
        stage: "normalize",
        retryable: isRetryableStatus(response.status),
        details: { status: response.status, reason: errorText.slice(0, 300) },
      });
    } catch (error) {
      if (error instanceof PipelineError) {
        throw error;
      }
      throw new PipelineError({
        code: "AI_NORMALIZATION_FAILED",
        message: `OpenRouter could not be reached for ${operation}`,
        stage: "normalize",
        retryable: true,
        details: {
          reason: error instanceof Error ? error.message : "AI request failed",
        },
      });
    }
  }
}

export function createOpenRouterNormalizerFromEnv(
  env: EnvironmentReader = Deno.env,
): OpenRouterNormalizer {
  const api_key: string = requiredEnvironment(env, "OPENROUTER_API_KEY");
  const timeoutText: string | undefined = env.get("OPENROUTER_TIMEOUT_MS");
  const timeout_ms: number | undefined = parseOptionalPositiveInteger(
    timeoutText,
  );
  return new OpenRouterNormalizer({
    api_key,
    model: OPENROUTER_MODEL,
    timeout_ms,
    site_url: env.get("OPENROUTER_SITE_URL"),
    site_name: env.get("OPENROUTER_SITE_NAME"),
  });
}

export interface EnvironmentReader {
  get(name: string): string | undefined;
}

export const RECIPE_NORMALIZATION_SCHEMA: Readonly<Record<string, unknown>> = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "ingredients",
    "steps",
    "ingredientLinks",
    "servings",
    "prepTimeMinutes",
    "cookTimeMinutes",
    "totalTimeMinutes",
    "images",
    "cuisineType",
    "dietaryTags",
    "parseConfidence",
    "status",
  ],
  properties: {
    title: { type: "string", minLength: 1 },
    description: { type: ["string", "null"] },
    ingredients: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "originalText",
          "quantity",
          "unit",
          "name",
          "notes",
          "measurements",
          "sortOrder",
        ],
        properties: {
          id: { type: "string", minLength: 1 },
          originalText: { type: "string", minLength: 1 },
          quantity: { type: ["number", "null"], exclusiveMinimum: 0 },
          unit: { type: ["string", "null"] },
          name: { type: "string", minLength: 1 },
          notes: { type: ["string", "null"] },
          measurements: ingredientMeasurementsSchema(),
          sortOrder: { type: "integer", minimum: 0 },
        },
      },
    },
    steps: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "instruction", "timerDurationMinutes", "sortOrder"],
        properties: {
          id: { type: "string", minLength: 1 },
          instruction: { type: "string", minLength: 1 },
          timerDurationMinutes: {
            type: ["integer", "null"],
            exclusiveMinimum: 0,
          },
          sortOrder: { type: "integer", minimum: 0 },
        },
      },
    },
    ingredientLinks: ingredientLinksSchema(),
    servings: { type: ["integer", "null"], exclusiveMinimum: 0 },
    prepTimeMinutes: { type: ["integer", "null"], minimum: 0 },
    cookTimeMinutes: { type: ["integer", "null"], minimum: 0 },
    totalTimeMinutes: { type: ["integer", "null"], minimum: 0 },
    images: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    cuisineType: { type: ["string", "null"] },
    dietaryTags: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    parseConfidence: {
      type: ["number", "null"],
      minimum: 0,
      maximum: 1,
    },
    status: {
      type: "string",
      enum: ["draft", "ready", "needs_review"],
    },
  },
};

export const INGREDIENT_NORMALIZATION_SCHEMA: Readonly<
  Record<string, unknown>
> = {
  type: "object",
  additionalProperties: false,
  required: ["ingredients", "ingredientLinks"],
  properties: {
    ingredients: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "originalText",
          "quantity",
          "unit",
          "name",
          "notes",
          "measurements",
          "sortOrder",
        ],
        properties: {
          id: { type: "string", minLength: 1 },
          originalText: { type: "string", minLength: 1 },
          quantity: { type: ["number", "null"], exclusiveMinimum: 0 },
          unit: { type: ["string", "null"] },
          name: { type: "string", minLength: 1 },
          notes: { type: ["string", "null"] },
          measurements: ingredientMeasurementsSchema(),
          sortOrder: { type: "integer", minimum: 0 },
        },
      },
    },
    ingredientLinks: ingredientLinksSchema(),
  },
};

function ingredientMeasurementsSchema(): Readonly<Record<string, unknown>> {
  return {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["quantityMin", "quantityMax", "unit", "isPrimary"],
      properties: {
        quantityMin: { type: "number", exclusiveMinimum: 0 },
        quantityMax: { type: "number", exclusiveMinimum: 0 },
        unit: { type: ["string", "null"] },
        isPrimary: { type: "boolean" },
      },
    },
  };
}

export const INGREDIENT_LINKING_SCHEMA: Readonly<Record<string, unknown>> = {
  type: "object",
  additionalProperties: false,
  required: ["links"],
  properties: {
    links: ingredientLinksSchema(),
  },
};

function ingredientLinksSchema(): Readonly<Record<string, unknown>> {
  return {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["stepId", "ingredientIds", "confidence"],
      properties: {
        stepId: { type: "string", minLength: 1 },
        ingredientIds: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
  };
}

async function fetchWithTimeout(
  transport: OpenRouterTransport,
  endpoint: string,
  init: RequestInit,
  controller: AbortController,
  timeout_ms: number,
): Promise<Response> {
  let timeout_id: ReturnType<typeof setTimeout> | undefined;
  let didTimeout: boolean = false;
  let timeoutError: PipelineError | undefined;
  const timeout: Promise<Response> = new Promise<Response>(
    (_resolve, reject): void => {
      timeout_id = setTimeout((): void => {
        didTimeout = true;
        timeoutError = new PipelineError({
          code: "AI_NORMALIZATION_FAILED",
          message: "OpenRouter request exceeded its timeout",
          stage: "normalize",
          retryable: true,
          details: { timeout_ms },
        });
        controller.abort();
        reject(timeoutError);
      }, timeout_ms);
    },
  );

  try {
    return await Promise.race([transport.fetch(endpoint, init), timeout]);
  } catch (error) {
    if (didTimeout && timeoutError !== undefined) {
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeout_id !== undefined) {
      clearTimeout(timeout_id);
    }
  }
}

async function readResponseText(
  response: Response,
  timeout_ms: number,
): Promise<string> {
  if (response.body === null) {
    return "";
  }
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body
    .getReader();
  const decoder: TextDecoder = new TextDecoder();
  const deadline: number = Date.now() + timeout_ms;
  let body: string = "";
  let complete: boolean = false;
  try {
    while (body.length < 200_000) {
      const remaining_ms: number = deadline - Date.now();
      if (remaining_ms <= 0) {
        throw responseBodyTimeout(timeout_ms);
      }
      const chunk: ReadableStreamReadResult<Uint8Array> =
        await readOpenRouterChunk(reader, remaining_ms, timeout_ms);
      if (chunk.done) {
        complete = true;
        body += decoder.decode();
        return body.slice(0, 200_000);
      }
      body += decoder.decode(chunk.value, { stream: true });
      if (isCompleteJson(body)) {
        return body.slice(0, 200_000);
      }
    }
    return body.slice(0, 200_000);
  } catch (error) {
    if (error instanceof PipelineError) {
      throw error;
    }
    throw new PipelineError({
      code: "AI_NORMALIZATION_FAILED",
      message: "OpenRouter returned an unreadable response",
      stage: "normalize",
      retryable: true,
      details: {
        reason: error instanceof Error
          ? error.message
          : "Response body read failed",
      },
    });
  } finally {
    if (!complete) {
      await reader.cancel().catch((): undefined => undefined);
    }
  }
}

function isCompleteJson(value: string): boolean {
  const trimmed: string = value.trim();
  if (
    !(trimmed.startsWith("{") && trimmed.endsWith("}")) &&
    !(trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

async function readOpenRouterChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  remaining_ms: number,
  timeout_ms: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeout_id: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject): void => {
        timeout_id = setTimeout(
          (): void => reject(responseBodyTimeout(timeout_ms)),
          remaining_ms,
        );
      }),
    ]);
  } finally {
    if (timeout_id !== undefined) {
      clearTimeout(timeout_id);
    }
  }
}

function responseBodyTimeout(timeout_ms: number): PipelineError {
  return new PipelineError({
    code: "AI_NORMALIZATION_FAILED",
    message: "OpenRouter response body exceeded its timeout",
    stage: "normalize",
    retryable: true,
    details: { timeout_ms },
  });
}

function parseResponseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new PipelineError({
      code: "AI_NORMALIZATION_FAILED",
      message: "OpenRouter returned an invalid JSON response envelope",
      stage: "normalize",
      retryable: true,
    });
  }
}

function extractMessageContent(value: unknown): string {
  if (!isRecord(value)) {
    throw invalidAiResponse("OpenRouter response is not an object");
  }
  const choices: unknown = value["choices"];
  if (!Array.isArray(choices) || choices.length === 0) {
    throw invalidAiResponse("OpenRouter response did not contain a choice");
  }
  const firstChoice: unknown = choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice["message"])) {
    throw invalidAiResponse("OpenRouter response did not contain a message");
  }
  const content: unknown = firstChoice["message"]["content"];
  if (typeof content !== "string" || content.trim().length === 0) {
    throw invalidAiResponse("OpenRouter message content was empty or not text");
  }
  return content.trim();
}

function invalidAiResponse(message: string): PipelineError {
  return new PipelineError({
    code: "RECIPE_OUTPUT_INVALID",
    message,
    stage: "normalize",
    retryable: true,
  });
}

function shouldRetryInline(error: PipelineError): boolean {
  if (error.code === "RECIPE_OUTPUT_INVALID") {
    return true;
  }
  return error.code === "AI_NORMALIZATION_FAILED" &&
    error.retryable && error.details["status"] === undefined;
}

function stripJsonCodeFence(content: string): string {
  const match: RegExpMatchArray | null = content.trim().match(
    /^```(?:json)?\s*([\s\S]*?)\s*```$/i,
  );
  return match?.[1]?.trim() ?? content.trim();
}

function extractJsonObjectText(content: string): string {
  const stripped: string = stripJsonCodeFence(content);
  if (isCompleteJson(stripped)) {
    return stripped;
  }
  const start: number = stripped.indexOf("{");
  const end: number = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate: string = stripped.slice(start, end + 1);
    if (isCompleteJson(candidate)) {
      return candidate;
    }
  }
  return stripped;
}

export function prepareRecipeSourceContent(content: string): string {
  const withoutNoise: string = content
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(?:p|div|li|section|article|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text: string = decodeHtmlEntities(withoutNoise)
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  if (text.length <= OPENROUTER_CONTENT_LIMIT) {
    return text;
  }

  const markerIndex: number = text.toLowerCase().search(
    /\b(?:ingredients|ingredient list|method|instructions|directions)\b/,
  );
  const start: number = markerIndex < 0 ? 0 : Math.max(0, markerIndex - 1_000);
  return text.slice(start, start + OPENROUTER_CONTENT_LIMIT);
}

function responseFormat(
  inline_attempt: number,
): Readonly<Record<string, unknown>> {
  if (inline_attempt === 1) {
    return {
      type: "json_schema",
      json_schema: {
        name: "recipe_normalization",
        strict: true,
        schema: RECIPE_NORMALIZATION_SCHEMA,
      },
    };
  }
  return { type: "json_object" };
}

function decodeHtmlEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (_match: string, entity: string): string => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      }
      return named[entity.toLowerCase()] ?? `&${entity};`;
    },
  );
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function parseOptionalPositiveInteger(
  value: string | undefined,
): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const parsed: number = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function requiredEnvironment(env: EnvironmentReader, name: string): string {
  const value: string | undefined = env.get(name);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
