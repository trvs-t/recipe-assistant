import { assertEquals } from "./assertions.ts";
import { type CanonicalIngredientPayload } from "../canonical-recipe.ts";
import {
  createImportHandler,
  type ImportHandlerDependencies,
} from "../handler.ts";
import {
  type AiNormalizationAdapter,
  type ErrorCode,
  type IngredientNormalizationAdapter,
  type NormalizedRecipeDraft,
  type SourceDocument,
  type SourceFetcher,
} from "../types.ts";
import {
  type ClaimedRecipeImport,
  type EnqueueRecipeImportInput,
  type IngredientBackfillSource,
  type RecipeImportGateway,
} from "../supabase-adapter.ts";
import { processClaimedImport } from "../worker.ts";

const textRecipe: string = `Lemony rice bowl

Ingredients
2 cups cooked rice
1 lemon, juiced

Instructions
Mix the rice and lemon juice, then serve warm.`;

class FakeGateway implements RecipeImportGateway {
  enqueueInput: EnqueueRecipeImportInput | null = null;
  normalizedContent: string | null = null;
  persistedRecipe: unknown = null;

  authenticate(_access_token: string): Promise<{ id: string }> {
    return Promise.resolve({ id: "user-1" });
  }

  enqueueRecipeImport(input: EnqueueRecipeImportInput): Promise<{
    job_id: string;
    job_status: string;
    recipe_id: string | null;
    deduplicated: boolean;
  }> {
    this.enqueueInput = input;
    return Promise.resolve({
      job_id: "job-1",
      job_status: "queued",
      recipe_id: null,
      deduplicated: false,
    });
  }

  claimRecipeImport(
    _visibility_timeout_seconds: number,
  ): Promise<ClaimedRecipeImport | null> {
    return Promise.resolve(null);
  }

  markStage(
    _claim: ClaimedRecipeImport,
    _stage: "fetch" | "extract" | "normalize" | "validate" | "persist",
    _fetch_count?: number,
  ): Promise<void> {
    return Promise.resolve();
  }

  persistRecipeImport(
    _claim: ClaimedRecipeImport,
    recipe: unknown,
  ): Promise<string> {
    this.persistedRecipe = recipe;
    return Promise.resolve("recipe-1");
  }

  loadIngredientBackfillSource(
    claim: ClaimedRecipeImport,
  ): Promise<IngredientBackfillSource> {
    return Promise.resolve({
      recipe_id: claim.target_recipe_id ?? "recipe-1",
      ingredients: ["228 gms (1 cup or 2 sticks) Butter (softened)"],
    });
  }

  persistIngredientBackfill(
    claim: ClaimedRecipeImport,
    ingredients: readonly CanonicalIngredientPayload[],
  ): Promise<string> {
    this.persistedRecipe = ingredients;
    return Promise.resolve(claim.target_recipe_id ?? "recipe-1");
  }

  finishRecipeImportError(
    _claim: ClaimedRecipeImport,
    _code: ErrorCode,
    _message: string,
    _retryable: boolean,
    _retry_delay_seconds: number,
  ): Promise<string> {
    return Promise.resolve("failed");
  }
}

function dependencies(gateway: FakeGateway): ImportHandlerDependencies {
  const source_fetcher: SourceFetcher = {
    fetch(): Promise<never> {
      return Promise.reject(
        new Error("URL fetching should not run for text input"),
      );
    },
  };
  const ai_normalizer: AiNormalizationAdapter = {
    normalize(): Promise<NormalizedRecipeDraft> {
      return Promise.resolve({
        title: "Lemony rice bowl",
        description: null,
        ingredients: [{
          original: "2 cups cooked rice",
          quantity: 2,
          unit: "cups",
          name: "cooked rice",
          notes: null,
        }],
        steps: ["Mix the rice and lemon juice, then serve warm."],
        servings: 2,
        prep_time_minutes: null,
        cook_time_minutes: null,
        image_url: null,
      });
    },
  };

  return {
    gateway,
    source_fetcher,
    ai_normalizer,
    worker_secret: "worker-secret",
  };
}

Deno.test("accepts plain text submissions without fabricating a source URL", async (): Promise<void> => {
  const gateway: FakeGateway = new FakeGateway();
  const handler = createImportHandler(dependencies(gateway));
  const response: Response = await handler(
    new Request("https://recipes.example/import", {
      method: "POST",
      headers: {
        authorization: "Bearer user-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source_text: textRecipe,
        idempotency_key: "text-key",
      }),
    }),
  );

  assertEquals(response.status, 202);
  assertEquals(gateway.enqueueInput?.source_url, null);
  assertEquals(gateway.enqueueInput?.source_text, textRecipe);
});

Deno.test("rejects a submission that mixes a URL and plain text", async (): Promise<void> => {
  const gateway: FakeGateway = new FakeGateway();
  const handler = createImportHandler(dependencies(gateway));
  const response: Response = await handler(
    new Request("https://recipes.example/import", {
      method: "POST",
      headers: {
        authorization: "Bearer user-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source_url: "https://recipes.example/rice",
        source_text: textRecipe,
        idempotency_key: "mixed-key",
      }),
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(gateway.enqueueInput, null);
});

Deno.test("rejects plain text that is too short to be a recipe", async (): Promise<void> => {
  const gateway: FakeGateway = new FakeGateway();
  const handler = createImportHandler(dependencies(gateway));
  const response: Response = await handler(
    new Request("https://recipes.example/import", {
      method: "POST",
      headers: {
        authorization: "Bearer user-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        source_text: "Too short",
        idempotency_key: "short-key",
      }),
    }),
  );

  assertEquals(response.status, 400);
  assertEquals(gateway.enqueueInput, null);
});

Deno.test("normalizes text claims without calling the URL fetcher", async (): Promise<void> => {
  const gateway: FakeGateway = new FakeGateway();
  const dependenciesForWorker = dependencies(gateway);
  const originalNormalizer: AiNormalizationAdapter =
    dependenciesForWorker.ai_normalizer;
  const capturingNormalizer: AiNormalizationAdapter = {
    normalize: async (input): Promise<NormalizedRecipeDraft> => {
      gateway.normalizedContent = input.content;
      return originalNormalizer.normalize(input);
    },
  };

  const claim: ClaimedRecipeImport = {
    message_id: 1,
    job_id: "job-1",
    source_url: null,
    source_text: textRecipe,
    attempt_number: 1,
    max_attempts: 3,
  };
  const result = await processClaimedImport(claim, {
    gateway,
    source_fetcher: dependenciesForWorker.source_fetcher,
    ai_normalizer: capturingNormalizer,
  });

  assertEquals(result.status, "completed");
  assertEquals(gateway.normalizedContent, textRecipe);
});

Deno.test("imports complete with inline and deterministic linking only", async (): Promise<void> => {
  const gateway: FakeGateway = new FakeGateway();
  const dependenciesForWorker = dependencies(gateway);
  const claim: ClaimedRecipeImport = {
    message_id: 1,
    job_id: "job-1",
    source_url: null,
    source_text: textRecipe,
    attempt_number: 1,
    max_attempts: 3,
  };

  const result = await processClaimedImport(claim, {
    gateway,
    source_fetcher: dependenciesForWorker.source_fetcher,
    ai_normalizer: dependenciesForWorker.ai_normalizer,
  });

  assertEquals(result.status, "completed");
});

Deno.test("JSON-LD ingredients use focused normalization before persistence", async (): Promise<void> => {
  const gateway: FakeGateway = new FakeGateway();
  const source_fetcher: SourceFetcher = {
    fetch(source_url: string): Promise<SourceDocument> {
      const jsonLd: string = JSON.stringify({
        "@type": "Recipe",
        name: "Buttercream",
        recipeIngredient: ["228 gms (1 cup or 2 sticks) Butter (softened)"],
        recipeInstructions: ["Beat until fluffy."],
      });
      return Promise.resolve({
        source_url,
        final_url: source_url,
        status: 200,
        content_type: "text/html",
        body: `<script type="application/ld+json">${jsonLd}</script>`,
        redirect_count: 0,
      });
    },
  };
  const ingredient_normalizer: IngredientNormalizationAdapter = {
    normalizeIngredients(input) {
      return Promise.resolve({
        ingredients: [{
          original: input.ingredients[0] ?? "",
          quantity: 228,
          unit: "g",
          name: "Butter",
          notes: "softened",
          measurements: [
            {
              quantity_min: 228,
              quantity_max: 228,
              unit: "g",
              is_primary: true,
            },
            {
              quantity_min: 1,
              quantity_max: 1,
              unit: "cup",
              is_primary: false,
            },
            {
              quantity_min: 2,
              quantity_max: 2,
              unit: "sticks",
              is_primary: false,
            },
          ],
        }],
        flow: {
          derivation: "enriched",
          nodes: [{
            id: "node:step:0",
            stepId: "step:0",
            ingredientIds: ["ingredient:0"],
          }],
          edges: [],
        },
      });
    },
  };
  const claim: ClaimedRecipeImport = {
    message_id: 2,
    job_id: "job-json-ld",
    source_url: "https://recipes.example/buttercream",
    source_text: null,
    attempt_number: 1,
    max_attempts: 3,
  };

  const result = await processClaimedImport(claim, {
    gateway,
    source_fetcher,
    ai_normalizer: dependencies(gateway).ai_normalizer,
    ingredient_normalizer,
  });

  assertEquals(result.status, "completed");
  const persisted = gateway.persistedRecipe as {
    ingredients?: Array<{ measurements?: unknown[] }>;
  };
  assertEquals(persisted.ingredients?.[0]?.measurements?.length, 3);
  const persistedFlow = gateway.persistedRecipe as {
    flow?: { nodes?: Array<{ ingredientIds?: string[] }> };
  };
  assertEquals(
    persistedFlow.flow?.nodes?.[0]?.ingredientIds?.[0],
    "ingredient:0",
  );
});

Deno.test("ingredient backfill reparses stored text and preserves the target recipe", async (): Promise<void> => {
  const gateway: FakeGateway = new FakeGateway();
  const ingredient_normalizer: IngredientNormalizationAdapter = {
    normalizeIngredients(input) {
      return Promise.resolve({
        ingredients: [{
          original: input.ingredients[0] ?? "",
          quantity: 228,
          unit: "gms",
          name: "Butter",
          notes: "softened",
          measurements: [
            {
              quantity_min: 228,
              quantity_max: 228,
              unit: "gms",
              is_primary: true,
            },
            {
              quantity_min: 1,
              quantity_max: 1,
              unit: "cup",
              is_primary: false,
            },
            {
              quantity_min: 2,
              quantity_max: 2,
              unit: "sticks",
              is_primary: false,
            },
          ],
        }],
        flow: null,
      });
    },
  };
  const claim: ClaimedRecipeImport = {
    message_id: 3,
    job_id: "job-backfill",
    source_url: "https://recipes.example/buttercream",
    source_text: null,
    attempt_number: 1,
    max_attempts: 3,
    target_recipe_id: "recipe-existing",
  };

  const result = await processClaimedImport(claim, {
    gateway,
    source_fetcher: dependencies(gateway).source_fetcher,
    ai_normalizer: dependencies(gateway).ai_normalizer,
    ingredient_normalizer,
  });

  assertEquals(result.status, "completed");
  assertEquals(result.recipe_id, "recipe-existing");
  const persisted = gateway
    .persistedRecipe as readonly CanonicalIngredientPayload[];
  assertEquals(persisted[0]?.name, "Butter");
  assertEquals(persisted[0]?.measurements.length, 3);
});
