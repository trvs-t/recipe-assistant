import { normalizeRecipeDraft } from "./ai-normalizer.ts";
import {
  type CanonicalIngredientPayload,
  type CanonicalRecipePayload,
  type CanonicalStepPayload,
  mapToCanonicalIngredients,
  mapToCanonicalRecipe,
} from "./canonical-recipe.ts";
import {
  isRetryableFailure,
  PipelineError,
  toStructuredError,
} from "./errors.ts";
import { extractRecipeFromJsonLd } from "./json-ld-extractor.ts";
import {
  type ClaimedRecipeImport,
  type RecipeImportGateway,
  type RecipeImportWorkerStage,
} from "./supabase-adapter.ts";
import {
  createDeterministicIngredientFlow,
  mergeIngredientFlows,
} from "./ingredient-linker.ts";
import {
  type AiNormalizationAdapter,
  type ImportStage,
  type IngredientLinkingAdapter,
  type IngredientLinkingIngredient,
  type IngredientLinkingInput,
  type IngredientLinkingStep,
  type IngredientNormalizationAdapter,
  type NormalizedRecipe,
  type RecipeFlow,
  type SourceDocument,
  type SourceFetcher,
  type StructuredError,
} from "./types.ts";

export interface ImportWorkerDependencies {
  readonly gateway: RecipeImportGateway;
  readonly source_fetcher: SourceFetcher;
  readonly ai_normalizer: AiNormalizationAdapter;
  readonly ingredient_linker?: IngredientLinkingAdapter;
  readonly ingredient_normalizer?: IngredientNormalizationAdapter;
  readonly retry_delay_seconds?: (claim: ClaimedRecipeImport) => number;
}

export interface WorkerProcessResult {
  readonly status: string;
  readonly recipe_id?: string;
  readonly error?: StructuredError;
}

/**
 * Processes one already-leased queue message and exactly one attempt. Retry
 * scheduling and terminal transitions are delegated to the SQL error RPC.
 */
export async function processClaimedImport(
  claim: ClaimedRecipeImport,
  dependencies: ImportWorkerDependencies,
): Promise<WorkerProcessResult> {
  let stage: ImportStage = "fetch";
  try {
    await markStage(dependencies.gateway, claim, "fetch");
    if (
      claim.target_recipe_id !== undefined && claim.target_recipe_id !== null
    ) {
      const source = await dependencies.gateway.loadIngredientBackfillSource(
        claim,
      );

      stage = "extract";
      await markStage(dependencies.gateway, claim, "extract", 0);

      stage = "normalize";
      await markStage(dependencies.gateway, claim, "normalize");
      if (dependencies.ingredient_normalizer === undefined) {
        throw new PipelineError({
          code: "AI_NORMALIZER_NOT_CONFIGURED",
          message: "Ingredient normalization is unavailable for the backfill",
          stage: "normalize",
          retryable: false,
        });
      }
      const normalizedIngredients = await dependencies.ingredient_normalizer
        .normalizeIngredients({ ingredients: source.ingredients });

      stage = "validate";
      await markStage(dependencies.gateway, claim, "validate");
      const ingredients: readonly CanonicalIngredientPayload[] =
        mapToCanonicalIngredients(normalizedIngredients);

      stage = "persist";
      await markStage(dependencies.gateway, claim, "persist");
      const recipe_id: string = await dependencies.gateway
        .persistIngredientBackfill(claim, ingredients);
      return { status: "completed", recipe_id };
    }

    const source: SourceDocument =
      claim.source_text === undefined || claim.source_text === null
        ? await fetchUrlSource(claim, dependencies.source_fetcher)
        : createTextSource(claim);

    stage = "extract";
    await markStage(
      dependencies.gateway,
      claim,
      "extract",
      1 + source.redirect_count,
    );
    const deterministicRecipe: NormalizedRecipe | null =
      claim.source_text === undefined || claim.source_text === null
        ? extractRecipeFromJsonLd(
          source.body,
          claim.source_url ?? source.source_url,
        )
        : null;

    stage = "normalize";
    await markStage(dependencies.gateway, claim, "normalize");
    let recipe: NormalizedRecipe;
    if (deterministicRecipe !== null) {
      recipe = await normalizeExtractedIngredients(
        deterministicRecipe,
        dependencies.ingredient_normalizer,
      );
    } else {
      const draft = await dependencies.ai_normalizer.normalize({
        source_url: claim.source_url,
        resolved_url: source.final_url,
        content: source.body,
        attempt: claim.attempt_number,
      });
      recipe = normalizeRecipeDraft(draft, claim.source_url);
    }

    stage = "validate";
    await markStage(dependencies.gateway, claim, "validate");
    const basePayload: CanonicalRecipePayload = mapToCanonicalRecipe(
      recipe,
      claim.source_url,
    );
    const payload: CanonicalRecipePayload = await enrichIngredientLinks(
      basePayload,
      dependencies.ingredient_linker,
    );

    stage = "persist";
    await markStage(dependencies.gateway, claim, "persist");
    const recipe_id: string = await dependencies.gateway.persistRecipeImport(
      claim,
      payload,
    );
    return {
      status: "completed",
      recipe_id,
    };
  } catch (error) {
    const structured: StructuredError = toStructuredError(
      error,
      stage,
      claim.attempt_number,
    );
    const retry_delay_seconds: number = retryDelaySeconds(
      claim,
      dependencies.retry_delay_seconds,
    );
    try {
      const status: string = await dependencies.gateway.finishRecipeImportError(
        claim,
        structured.code,
        structured.message,
        isRetryableFailure(error),
        retry_delay_seconds,
      );
      return {
        status,
        error: structured,
      };
    } catch (finalizationError) {
      throw new PipelineError({
        code: "PERSISTENCE_FAILED",
        message:
          `The import failed and its durable error state could not be written: ${
            errorMessage(finalizationError)
          }`,
        stage: "persist",
        retryable: true,
        details: {
          original_code: structured.code,
        },
      });
    }
  }
}

async function normalizeExtractedIngredients(
  recipe: NormalizedRecipe,
  normalizer: IngredientNormalizationAdapter | undefined,
): Promise<NormalizedRecipe> {
  if (normalizer === undefined) {
    return recipe;
  }
  try {
    const ingredients = await normalizer.normalizeIngredients({
      ingredients: recipe.ingredients.map((ingredient): string =>
        ingredient.original
      ),
    });
    return { ...recipe, ingredients };
  } catch (error) {
    console.warn(JSON.stringify({
      event: "ingredient_normalization_fallback",
      message: error instanceof Error
        ? error.message
        : "Ingredient normalization failed",
    }));
    return recipe;
  }
}

async function enrichIngredientLinks(
  payload: CanonicalRecipePayload,
  ingredient_linker: IngredientLinkingAdapter | undefined,
): Promise<CanonicalRecipePayload> {
  if (hasLinksForEveryStep(payload.flow, payload.steps)) {
    return payload;
  }

  const steps: readonly IngredientLinkingStep[] = payload.steps.map(
    (step: CanonicalStepPayload): IngredientLinkingStep => ({
      id: step.id,
      instruction: step.instruction,
    }),
  );
  const ingredients: readonly IngredientLinkingIngredient[] = payload
    .ingredients.map(
      (
        ingredient: CanonicalIngredientPayload,
      ): IngredientLinkingIngredient => ({
        id: ingredient.id,
        originalText: ingredient.originalText,
        name: ingredient.name,
      }),
    );
  const baseFlow: RecipeFlow | null = payload.flow.derivation === "enriched"
    ? payload.flow
    : null;
  const deterministicFlow: RecipeFlow | null = mergeIngredientFlows(
    baseFlow,
    createDeterministicIngredientFlow({ ingredients, steps }),
    steps,
  );
  if (
    hasLinksForEveryStep(deterministicFlow, payload.steps) ||
    ingredient_linker === undefined
  ) {
    return deterministicFlow === null
      ? payload
      : { ...payload, flow: deterministicFlow };
  }

  try {
    const input: IngredientLinkingInput = deterministicFlow === null
      ? { ingredients, steps }
      : { ingredients, steps, deterministic_flow: deterministicFlow };
    const modelFlow: RecipeFlow | null = await ingredient_linker.link(input);
    const linkedFlow: RecipeFlow | null = mergeIngredientFlows(
      deterministicFlow,
      modelFlow,
      steps,
    );
    return linkedFlow === null ? payload : { ...payload, flow: linkedFlow };
  } catch (error) {
    console.warn(JSON.stringify({
      event: "ingredient_linking_fallback",
      message: error instanceof Error
        ? error.message
        : "Ingredient linking failed",
    }));
    return deterministicFlow === null
      ? payload
      : { ...payload, flow: deterministicFlow };
  }
}

function hasLinksForEveryStep(
  flow: RecipeFlow | null,
  steps: readonly CanonicalStepPayload[],
): boolean {
  if (flow === null || flow.derivation !== "enriched") {
    return false;
  }
  const nodesByStepId: Map<string, readonly string[]> = new Map<
    string,
    readonly string[]
  >(
    flow.nodes.map((
      node,
    ): [string, readonly string[]] => [node.stepId, node.ingredientIds]),
  );
  return steps.every((step: CanonicalStepPayload): boolean =>
    (nodesByStepId.get(step.id)?.length ?? 0) > 0
  );
}

async function fetchUrlSource(
  claim: ClaimedRecipeImport,
  source_fetcher: SourceFetcher,
): Promise<SourceDocument> {
  if (claim.source_url === null) {
    throw new Error("A URL import is missing its source URL");
  }

  return source_fetcher.fetch(claim.source_url, claim.attempt_number);
}

function createTextSource(claim: ClaimedRecipeImport): SourceDocument {
  const source_text: string = claim.source_text ?? "";
  return {
    source_url: "text-input",
    final_url: "text-input",
    status: 200,
    content_type: "text/plain",
    body: source_text,
    redirect_count: 0,
  };
}

function markStage(
  gateway: RecipeImportGateway,
  claim: ClaimedRecipeImport,
  stage: RecipeImportWorkerStage,
  fetch_count?: number,
): Promise<void> {
  return gateway.markStage(claim, stage, fetch_count);
}

function retryDelaySeconds(
  claim: ClaimedRecipeImport,
  configured: ((claim: ClaimedRecipeImport) => number) | undefined,
): number {
  const value: number = configured === undefined
    ? Math.min(300, 2 ** Math.max(0, claim.attempt_number - 1))
    : configured(claim);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown persistence error";
}
