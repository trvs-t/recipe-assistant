import { assertEquals } from "./assertions.ts";
import {
  createImportHandler,
  type ImportHandlerDependencies,
} from "../handler.ts";
import {
  type AiNormalizationAdapter,
  type ErrorCode,
  type NormalizedRecipeDraft,
  type SourceFetcher,
} from "../types.ts";
import {
  type ClaimedRecipeImport,
  type EnqueueRecipeImportInput,
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

  claimRecipeImport(_visibility_timeout_seconds: number): Promise<ClaimedRecipeImport | null> {
    return Promise.resolve(null);
  }

  markStage(
    _claim: ClaimedRecipeImport,
    _stage: "fetch" | "extract" | "normalize" | "validate" | "persist",
    _fetch_count?: number,
  ): Promise<void> {
    return Promise.resolve();
  }

  persistRecipeImport(_claim: ClaimedRecipeImport, _recipe: unknown): Promise<string> {
    return Promise.resolve("recipe-1");
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
      return Promise.reject(new Error("URL fetching should not run for text input"));
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
  const response: Response = await handler(new Request("https://recipes.example/import", {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ source_text: textRecipe, idempotency_key: "text-key" }),
  }));

  assertEquals(response.status, 202);
  assertEquals(gateway.enqueueInput?.source_url, null);
  assertEquals(gateway.enqueueInput?.source_text, textRecipe);
});

Deno.test("rejects a submission that mixes a URL and plain text", async (): Promise<void> => {
  const gateway: FakeGateway = new FakeGateway();
  const handler = createImportHandler(dependencies(gateway));
  const response: Response = await handler(new Request("https://recipes.example/import", {
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
  }));

  assertEquals(response.status, 400);
  assertEquals(gateway.enqueueInput, null);
});

Deno.test("rejects plain text that is too short to be a recipe", async (): Promise<void> => {
  const gateway: FakeGateway = new FakeGateway();
  const handler = createImportHandler(dependencies(gateway));
  const response: Response = await handler(new Request("https://recipes.example/import", {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ source_text: "Too short", idempotency_key: "short-key" }),
  }));

  assertEquals(response.status, 400);
  assertEquals(gateway.enqueueInput, null);
});

Deno.test("normalizes text claims without calling the URL fetcher", async (): Promise<void> => {
  const gateway: FakeGateway = new FakeGateway();
  const dependenciesForWorker = dependencies(gateway);
  const originalNormalizer: AiNormalizationAdapter = dependenciesForWorker.ai_normalizer;
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
