import { normalizeRecipeDraft } from "../ai-normalizer.ts";
import {
  type CanonicalRecipePayload,
  mapToCanonicalRecipe,
} from "../canonical-recipe.ts";
import { PipelineError } from "../errors.ts";
import {
  createImportHandler,
  type IImportBackgroundTaskRunner,
} from "../handler.ts";
import {
  createDefaultHandler,
  createEdgeRuntimeBackgroundTaskRunner,
} from "../index.ts";
import {
  OpenRouterNormalizer,
  type OpenRouterTransport,
} from "../openrouter-normalizer.ts";
import {
  type ClaimedRecipeImport,
  type RecipeImportGateway,
  type RecipeImportWorkerStage,
  type SupabaseCallResult,
  type SupabaseImportTransport,
  SupabaseRecipeImportGateway,
} from "../supabase-adapter.ts";
import {
  type AiNormalizationAdapter,
  type ErrorCode,
  type NormalizedRecipe,
  type NormalizedRecipeDraft,
  type SourceDocument,
  type SourceFetcher,
} from "../types.ts";
import { assert, assertDeepEquals, assertEquals } from "./assertions.ts";

const source_url: string = "https://recipes.example/production";
const worker_secret: string = "worker-secret";

class FakeGateway implements RecipeImportGateway {
  readonly authTokens: string[] = [];
  readonly enqueueInputs: Array<{
    user_id: string;
    source_url: string;
    idempotency_key: string;
  }> = [];
  readonly claims: Array<{
    visibility_timeout_seconds: number;
  }> = [];
  readonly stages: RecipeImportWorkerStage[] = [];
  readonly persisted: Array<{
    job_id: string;
    recipe: CanonicalRecipePayload;
  }> = [];
  readonly finished: Array<{
    job_id: string;
    code: string;
    message: string;
    retryable: boolean;
    retry_delay_seconds: number;
  }> = [];
  readonly finishStatuses: string[] = [];
  user_id: string = "auth-user-id";
  enqueueResult: {
    job_id: string;
    job_status: string;
    recipe_id: string | null;
    deduplicated: boolean;
  } = {
    job_id: "job-1",
    job_status: "queued",
    recipe_id: null,
    deduplicated: false,
  };
  claim: ClaimedRecipeImport | null = null;
  readonly claimSequence: ClaimedRecipeImport[] = [];

  async authenticate(access_token: string): Promise<{ id: string }> {
    this.authTokens.push(access_token);
    return { id: this.user_id };
  }

  async enqueueRecipeImport(input: {
    user_id: string;
    source_url: string;
    idempotency_key: string;
  }): Promise<{
    job_id: string;
    job_status: string;
    recipe_id: string | null;
    deduplicated: boolean;
  }> {
    this.enqueueInputs.push(input);
    return this.enqueueResult;
  }

  async claimRecipeImport(
    visibility_timeout_seconds: number,
  ): Promise<ClaimedRecipeImport | null> {
    this.claims.push({ visibility_timeout_seconds });
    const sequencedClaim: ClaimedRecipeImport | undefined = this.claimSequence
      .shift();
    if (sequencedClaim !== undefined) {
      return sequencedClaim;
    }
    return this.claim;
  }

  async markStage(
    _claim: ClaimedRecipeImport,
    stage: RecipeImportWorkerStage,
  ): Promise<void> {
    this.stages.push(stage);
  }

  async persistRecipeImport(
    claim: ClaimedRecipeImport,
    recipe: CanonicalRecipePayload,
  ): Promise<string> {
    this.persisted.push({ job_id: claim.job_id, recipe });
    return "recipe-1";
  }

  async finishRecipeImportError(
    claim: ClaimedRecipeImport,
    code: ErrorCode,
    message: string,
    retryable: boolean,
    retry_delay_seconds: number,
  ): Promise<string> {
    this.finished.push({
      job_id: claim.job_id,
      code: String(code),
      message,
      retryable,
      retry_delay_seconds,
    });
    const status: string =
      retryable && claim.attempt_number < claim.max_attempts
        ? "retry_wait"
        : code === "RECIPE_NOT_FOUND" || String(code) === "INSUFFICIENT_CONTENT"
        ? "needs_input"
        : "failed";
    this.finishStatuses.push(status);
    return status;
  }
}

const noOpAi: AiNormalizationAdapter = {
  normalize(_input): Promise<NormalizedRecipeDraft> {
    return Promise.reject(new Error("AI must not be called"));
  },
};

function sourceFetcher(body: string): SourceFetcher {
  return {
    async fetch(
      _source_url: string,
      _attempt: number,
    ): Promise<SourceDocument> {
      return {
        source_url,
        final_url: source_url,
        status: 200,
        content_type: "text/html",
        body,
        redirect_count: 0,
      };
    },
  };
}

function handler(
  gateway: FakeGateway,
  source_fetcher: SourceFetcher = sourceFetcher("<html />"),
  ai_normalizer: AiNormalizationAdapter = noOpAi,
  background_task_runner?: IImportBackgroundTaskRunner,
): (request: Request) => Promise<Response> {
  return createImportHandler({
    gateway,
    source_fetcher,
    ai_normalizer,
    worker_secret,
    visibility_timeout_seconds: 120,
    background_task_runner,
  });
}

function jsonLdBody(): string {
  return `<script type="application/ld+json">${
    JSON.stringify({
      "@type": "Recipe",
      name: "Durable Curry",
      recipeIngredient: ["1 cup rice"],
      recipeInstructions: ["Cook the rice."],
    })
  }</script>`;
}

interface OpenRouterFailureCase {
  readonly name: string;
  readonly transport_factory: () => OpenRouterTransport;
  readonly expected_code: ErrorCode;
  readonly expected_retryable: boolean;
  readonly expected_message?: string;
  readonly timeout_ms?: number;
}

function responseTransport(
  body: string,
  status: number = 200,
): OpenRouterTransport {
  return {
    fetch(_input: string, _init: RequestInit): Promise<Response> {
      return Promise.resolve(new Response(body, { status }));
    },
  };
}

function rejectingTransport(message: string): OpenRouterTransport {
  return {
    fetch(_input: string, _init: RequestInit): Promise<Response> {
      return Promise.reject(new Error(message));
    },
  };
}

function timeoutTransport(): OpenRouterTransport {
  return {
    fetch(_input: string, init: RequestInit): Promise<Response> {
      return new Promise<Response>((_resolve, reject): void => {
        const signal: AbortSignal | null | undefined = init.signal;
        if (signal === null || signal === undefined) {
          return;
        }
        if (signal.aborted) {
          reject(new Error("request aborted"));
          return;
        }
        signal.addEventListener("abort", (): void => {
          reject(new Error("request aborted"));
        }, { once: true });
      });
    },
  };
}

function openRouterEnvelope(content: string): string {
  return JSON.stringify({
    choices: [{ message: { content } }],
  });
}

function pipelineError(error: unknown): PipelineError {
  if (!(error instanceof PipelineError)) {
    throw new Error(`Expected PipelineError, received ${String(error)}`);
  }
  return error;
}

const invalidRecipeSchemaJson: string = JSON.stringify({
  title: "Invalid recipe",
  description: null,
  ingredients: [],
  steps: [],
  servings: 2,
  prepTimeMinutes: 5,
  cookTimeMinutes: 10,
  totalTimeMinutes: 15,
  images: [],
  cuisineType: null,
  dietaryTags: [],
  parseConfidence: 0.2,
  status: "ready",
});

const openRouterFailureCases: readonly OpenRouterFailureCase[] = [
  {
    name: "network rejection",
    transport_factory: (): OpenRouterTransport =>
      rejectingTransport("connection refused"),
    expected_code: "AI_NORMALIZATION_FAILED",
    expected_retryable: true,
    expected_message: "OpenRouter could not be reached",
  },
  {
    name: "timeout",
    transport_factory: timeoutTransport,
    timeout_ms: 5,
    expected_code: "AI_NORMALIZATION_FAILED",
    expected_retryable: true,
    expected_message: "OpenRouter request exceeded its timeout",
  },
  ...[408, 429, 500, 502, 503].map(
    (status: number): OpenRouterFailureCase => ({
      name: `HTTP ${status} retryable response`,
      transport_factory: (): OpenRouterTransport =>
        responseTransport("temporary upstream failure", status),
      expected_code: "AI_NORMALIZATION_FAILED",
      expected_retryable: true,
    }),
  ),
  ...[400, 401, 402, 403].map(
    (status: number): OpenRouterFailureCase => ({
      name: `HTTP ${status} non-retryable response`,
      transport_factory: (): OpenRouterTransport =>
        responseTransport("permanent upstream failure", status),
      expected_code: "AI_NORMALIZATION_FAILED",
      expected_retryable: false,
    }),
  ),
  {
    name: "malformed JSON envelope",
    transport_factory: (): OpenRouterTransport =>
      responseTransport("{not-json"),
    expected_code: "AI_NORMALIZATION_FAILED",
    expected_retryable: true,
    expected_message: "OpenRouter returned an invalid JSON response envelope",
  },
  {
    name: "missing choices",
    transport_factory: (): OpenRouterTransport => responseTransport("{}"),
    expected_code: "RECIPE_OUTPUT_INVALID",
    expected_retryable: false,
    expected_message: "OpenRouter response did not contain a choice",
  },
  {
    name: "missing message",
    transport_factory: (): OpenRouterTransport =>
      responseTransport(JSON.stringify({ choices: [{}] })),
    expected_code: "RECIPE_OUTPUT_INVALID",
    expected_retryable: false,
    expected_message: "OpenRouter response did not contain a message",
  },
  {
    name: "empty content",
    transport_factory: (): OpenRouterTransport =>
      responseTransport(openRouterEnvelope("   ")),
    expected_code: "RECIPE_OUTPUT_INVALID",
    expected_retryable: false,
    expected_message: "OpenRouter message content was empty or not text",
  },
  {
    name: "syntactically valid but recipe-schema-invalid JSON",
    transport_factory: (): OpenRouterTransport =>
      responseTransport(openRouterEnvelope(invalidRecipeSchemaJson)),
    expected_code: "RECIPE_OUTPUT_INVALID",
    expected_retryable: false,
    expected_message: "AI normalization returned an incomplete recipe",
  },
];

for (const failureCase of openRouterFailureCases) {
  Deno.test(`OpenRouter normalizer classifies ${failureCase.name}`, async () => {
    const normalizer: OpenRouterNormalizer = new OpenRouterNormalizer({
      api_key: "test-key",
      model: "qwen/qwen3.6-plus",
      timeout_ms: failureCase.timeout_ms ?? 100,
      transport: failureCase.transport_factory(),
    });

    try {
      await normalizer.normalize({
        source_url,
        resolved_url: source_url,
        content: "recipe content",
        attempt: 1,
      });
      throw new Error(`Expected ${failureCase.name} to fail`);
    } catch (error) {
      const normalizedError: PipelineError = pipelineError(error);
      assertEquals(normalizedError.code, failureCase.expected_code);
      assertEquals(normalizedError.retryable, failureCase.expected_retryable);
      if (failureCase.expected_message !== undefined) {
        assertEquals(normalizedError.message, failureCase.expected_message);
      }
    }
  });
}

Deno.test("public POST authenticates with Supabase Auth and only enqueues", async () => {
  const gateway: FakeGateway = new FakeGateway();
  let fetchCalls: number = 0;
  const source_fetcher: SourceFetcher = {
    async fetch(
      _source_url: string,
      _attempt: number,
    ): Promise<SourceDocument> {
      fetchCalls += 1;
      throw new Error("submission must not fetch");
    },
  };
  const response: Response = await handler(gateway, source_fetcher)(
    new Request(
      "https://function.example/import-recipe-v2",
      {
        method: "POST",
        headers: {
          authorization: "Bearer caller-jwt",
          "x-user-id": "attacker-controlled-id",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceUrl: source_url,
          idempotencyKey: "key-1",
        }),
      },
    ),
  );

  assertEquals(response.status, 202);
  assertEquals(fetchCalls, 0);
  assertDeepEquals(gateway.authTokens, ["caller-jwt"]);
  assertDeepEquals(gateway.enqueueInputs, [{
    user_id: "auth-user-id",
    source_url,
    idempotency_key: "key-1",
  }]);
  assertDeepEquals(await response.json(), {
    job_id: "job-1",
    status: "queued",
    job_status: "queued",
    recipe_id: null,
    deduplicated: false,
  });
});

Deno.test("public POST returns before a best-effort worker kick processes the queue", async () => {
  const gateway: FakeGateway = new FakeGateway();
  gateway.claim = {
    message_id: 9,
    job_id: "job-9",
    source_url,
    attempt_number: 1,
    max_attempts: 3,
  };
  let fetchCalls: number = 0;
  const source_fetcher: SourceFetcher = {
    async fetch(
      _source_url: string,
      _attempt: number,
    ): Promise<SourceDocument> {
      fetchCalls += 1;
      return await sourceFetcher(jsonLdBody()).fetch(source_url, 1);
    },
  };
  const tasks: Array<() => Promise<void>> = [];
  const background_task_runner: IImportBackgroundTaskRunner = {
    schedule(task: () => Promise<void>): void {
      tasks.push(task);
    },
  };

  const response: Response = await handler(
    gateway,
    source_fetcher,
    noOpAi,
    background_task_runner,
  )(
    new Request(
      "https://function.example/import-recipe-v2",
      {
        method: "POST",
        headers: {
          authorization: "Bearer caller-jwt",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceUrl: source_url,
          idempotencyKey: "key-immediate-worker",
        }),
      },
    ),
  );

  assertEquals(response.status, 202);
  assertEquals(fetchCalls, 0);
  assertEquals(gateway.claims.length, 0);
  assertEquals(tasks.length, 1);

  const task: (() => Promise<void>) | undefined = tasks[0];
  assert(task !== undefined, "Expected one scheduled background task");
  await task();

  assertEquals(gateway.claims.length, 1);
  assertEquals(fetchCalls, 1);
  assertEquals(gateway.persisted.length, 1);
});

Deno.test("Edge Runtime background runner registers the worker promise with waitUntil", async () => {
  let capturedPromise: Promise<void> | null = null;
  let taskRan: boolean = false;
  const background_task_runner: IImportBackgroundTaskRunner | undefined =
    createEdgeRuntimeBackgroundTaskRunner({
      waitUntil(promise: Promise<void>): void {
        capturedPromise = promise;
      },
    });

  if (background_task_runner === undefined) {
    throw new Error("Expected a runner when EdgeRuntime is available");
  }
  background_task_runner.schedule(async (): Promise<void> => {
    taskRan = true;
  });

  assert(capturedPromise !== null, "Expected waitUntil to receive the task");
  await capturedPromise;
  assertEquals(taskRan, true);
});

Deno.test("public POST does not kick a worker for an already completed job", async () => {
  const gateway: FakeGateway = new FakeGateway();
  gateway.enqueueResult = {
    job_id: "job-complete",
    job_status: "completed",
    recipe_id: "recipe-complete",
    deduplicated: true,
  };
  const tasks: Array<() => Promise<void>> = [];
  const background_task_runner: IImportBackgroundTaskRunner = {
    schedule(task: () => Promise<void>): void {
      tasks.push(task);
    },
  };

  const response: Response = await handler(
    gateway,
    sourceFetcher("<html />"),
    noOpAi,
    background_task_runner,
  )(
    new Request("https://function.example/import-recipe-v2", {
      method: "POST",
      headers: {
        authorization: "Bearer caller-jwt",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sourceUrl: source_url,
        idempotencyKey: "key-completed-job",
      }),
    }),
  );

  assertEquals(response.status, 202);
  assertEquals(tasks.length, 0);
  assertEquals(gateway.claims.length, 0);
});

Deno.test("public POST rejects requests without a bearer token even with x-user-id", async () => {
  const gateway: FakeGateway = new FakeGateway();
  const response: Response = await handler(gateway)(
    new Request(
      "https://function.example/import-recipe-v2",
      {
        method: "POST",
        headers: {
          "x-user-id": "not-authenticated",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sourceUrl: source_url,
          idempotencyKey: "key-2",
        }),
      },
    ),
  );

  assertEquals(response.status, 401);
  assertEquals(gateway.enqueueInputs.length, 0);
  assertEquals(gateway.authTokens.length, 0);
});

Deno.test("worker action is secret-gated and returns 204 for an empty queue", async () => {
  const gateway: FakeGateway = new FakeGateway();
  const response: Response = await handler(gateway)(
    new Request(
      "https://function.example/import-recipe-v2?action=worker",
      {
        method: "POST",
        headers: { "x-import-worker-secret": worker_secret },
      },
    ),
  );

  assertEquals(response.status, 204);
  assertEquals(gateway.claims.length, 1);
  assertEquals(gateway.stages.length, 0);
});

Deno.test("worker processes one claimed attempt with JSON-LD and canonical persistence", async () => {
  const gateway: FakeGateway = new FakeGateway();
  gateway.claim = {
    message_id: 7,
    job_id: "job-7",
    source_url,
    attempt_number: 1,
    max_attempts: 3,
  };
  let fetchCalls: number = 0;
  const source_fetcher: SourceFetcher = {
    async fetch(
      _source_url: string,
      _attempt: number,
    ): Promise<SourceDocument> {
      fetchCalls += 1;
      return (await sourceFetcher(jsonLdBody()).fetch(source_url, 1));
    },
  };

  const response: Response = await handler(gateway, source_fetcher)(
    new Request(
      "https://function.example/import-recipe-v2?action=worker",
      {
        method: "POST",
        headers: { "x-import-worker-secret": worker_secret },
      },
    ),
  );

  assertEquals(response.status, 204);
  assertEquals(fetchCalls, 1);
  assertDeepEquals(gateway.stages, [
    "fetch",
    "extract",
    "normalize",
    "validate",
    "persist",
  ]);
  assertEquals(gateway.finished.length, 0);
  assertEquals(gateway.persisted.length, 1);
  const payload: CanonicalRecipePayload = gateway.persisted[0]
    ?.recipe as CanonicalRecipePayload;
  assertEquals(payload.sourceUrl, source_url);
  assertEquals(payload.status, "ready");
  assertEquals(payload.ingredients[0]?.id, "ingredient:0");
  assertEquals(payload.ingredients[0]?.originalText, "1 cup rice");
  assertEquals(payload.ingredients[0]?.sortOrder, 0);
  assertEquals(payload.steps[0]?.id, "step:0");
  assertEquals(payload.steps[0]?.sortOrder, 0);
  assertEquals(payload.flow.derivation, "linear_fallback");
  assertEquals(payload.flow.nodes[0]?.stepId, "step:0");
});

Deno.test("worker durably finalizes a retryable failure without an inline retry", async () => {
  const gateway: FakeGateway = new FakeGateway();
  gateway.claim = {
    message_id: 8,
    job_id: "job-8",
    source_url,
    attempt_number: 2,
    max_attempts: 3,
  };
  const failingFetcher: SourceFetcher = {
    async fetch(
      _source_url: string,
      _attempt: number,
    ): Promise<SourceDocument> {
      throw new PipelineError({
        code: "FETCH_TIMEOUT",
        message: "temporary source timeout",
        stage: "fetch",
        retryable: true,
      });
    },
  };

  const response: Response = await handler(gateway, failingFetcher)(
    new Request(
      "https://function.example/import-recipe-v2?action=worker",
      {
        method: "POST",
        headers: { "x-import-worker-secret": worker_secret },
      },
    ),
  );

  assertEquals(response.status, 204);
  assertEquals(gateway.finished.length, 1);
  assertDeepEquals(gateway.finished[0], {
    job_id: "job-8",
    code: "FETCH_TIMEOUT",
    message: "temporary source timeout",
    retryable: true,
    retry_delay_seconds: 2,
  });
});

interface WorkerAiFailureCase {
  readonly name: string;
  readonly transport_factory: () => OpenRouterTransport;
  readonly expected_code: ErrorCode;
  readonly expected_retryable: boolean;
  readonly expected_status: string;
}

const workerAiFailureCases: readonly WorkerAiFailureCase[] = [
  {
    name: "retryable network failure",
    transport_factory: (): OpenRouterTransport =>
      rejectingTransport("connection refused"),
    expected_code: "AI_NORMALIZATION_FAILED",
    expected_retryable: true,
    expected_status: "retry_wait",
  },
  {
    name: "non-retryable invalid recipe output",
    transport_factory: (): OpenRouterTransport =>
      responseTransport(openRouterEnvelope(invalidRecipeSchemaJson)),
    expected_code: "RECIPE_OUTPUT_INVALID",
    expected_retryable: false,
    expected_status: "failed",
  },
];

for (const failureCase of workerAiFailureCases) {
  Deno.test(`worker finalizes ${failureCase.name} durably`, async () => {
    const gateway: FakeGateway = new FakeGateway();
    gateway.claim = {
      message_id: 20,
      job_id: "job-ai-failure",
      source_url,
      attempt_number: 1,
      max_attempts: 3,
    };
    const normalizer: OpenRouterNormalizer = new OpenRouterNormalizer({
      api_key: "test-key",
      model: "qwen/qwen3.6-plus",
      timeout_ms: 100,
      transport: failureCase.transport_factory(),
    });

    const response: Response = await handler(
      gateway,
      sourceFetcher("<html />"),
      normalizer,
    )(
      new Request(
        "https://function.example/import-recipe-v2?action=worker",
        {
          method: "POST",
          headers: { "x-import-worker-secret": worker_secret },
        },
      ),
    );

    assertEquals(response.status, 204);
    assertEquals(gateway.persisted.length, 0);
    assertEquals(gateway.finished.length, 1);
    assertEquals(gateway.finished[0]?.code, failureCase.expected_code);
    assertEquals(
      gateway.finished[0]?.retryable,
      failureCase.expected_retryable,
    );
    assertDeepEquals(gateway.finishStatuses, [failureCase.expected_status]);
  });
}

Deno.test(
  "worker bounds repeated retryable AI failures at the claim attempt budget",
  async () => {
    const gateway: FakeGateway = new FakeGateway();
    gateway.claimSequence.push({
      message_id: 21,
      job_id: "job-repeated-ai-failure",
      source_url,
      attempt_number: 1,
      max_attempts: 3,
    }, {
      message_id: 22,
      job_id: "job-repeated-ai-failure",
      source_url,
      attempt_number: 2,
      max_attempts: 3,
    }, {
      message_id: 23,
      job_id: "job-repeated-ai-failure",
      source_url,
      attempt_number: 3,
      max_attempts: 3,
    });
    let aiCalls: number = 0;
    const transport: OpenRouterTransport = {
      fetch(_input: string, _init: RequestInit): Promise<Response> {
        aiCalls += 1;
        return Promise.reject(new Error("connection refused"));
      },
    };
    const normalizer: OpenRouterNormalizer = new OpenRouterNormalizer({
      api_key: "test-key",
      model: "qwen/qwen3.6-plus",
      timeout_ms: 100,
      transport,
    });
    const worker: (request: Request) => Promise<Response> = handler(
      gateway,
      sourceFetcher("<html />"),
      normalizer,
    );

    for (let attempt: number = 0; attempt < 3; attempt += 1) {
      const response: Response = await worker(
        new Request(
          "https://function.example/import-recipe-v2?action=worker",
          {
            method: "POST",
            headers: { "x-import-worker-secret": worker_secret },
          },
        ),
      );
      assertEquals(response.status, 204);
    }

    assertEquals(aiCalls, 3);
    assertDeepEquals(gateway.finishStatuses, [
      "retry_wait",
      "retry_wait",
      "failed",
    ]);
    assertEquals(gateway.finished[2]?.retryable, true);
  },
);

Deno.test("canonical mapper preserves IDs and order and creates deterministic linear flow", () => {
  const recipe: NormalizedRecipe = {
    title: "Mapped Recipe",
    description: "Description",
    ingredients: [{
      id: "ingredient-known",
      original: "2 tbsp oil",
      quantity: 2,
      unit: "tbsp",
      name: "oil",
      notes: null,
      sort_order: 4,
    }],
    steps: ["Mix", "Cook"],
    step_details: [{
      id: "step-a",
      instruction: "Mix",
      timer_duration_minutes: null,
      sort_order: 1,
    }, {
      id: "step-b",
      instruction: "Cook",
      timer_duration_minutes: 8,
      sort_order: 2,
    }],
    servings: 2,
    prep_time_minutes: 3,
    cook_time_minutes: 8,
    image_url: null,
    source_url,
    total_time_minutes: 11,
    images: ["https://images.example/recipe.jpg"],
    parse_confidence: 0.91,
  };
  const payload: CanonicalRecipePayload = mapToCanonicalRecipe(
    recipe,
    source_url,
  );
  assertEquals(payload.ingredients[0]?.id, "ingredient-known");
  assertEquals(payload.ingredients[0]?.sortOrder, 4);
  assertEquals(payload.steps[1]?.id, "step-b");
  assertEquals(payload.steps[1]?.timerDurationMinutes, 8);
  assertEquals(payload.totalTimeMinutes, 11);
  assertDeepEquals(payload.images, ["https://images.example/recipe.jpg"]);
  assertEquals(payload.parseConfidence, 0.91);
  assertDeepEquals(payload.flow.edges, [{
    id: "edge:step-a:step-b",
    fromNodeId: "node:step-a",
    toNodeId: "node:step-b",
    kind: "sequence",
  }]);
});

Deno.test("OpenRouter adapter requires strict structured output and validates the response", async () => {
  let requestBody: Record<string, unknown> | null = null;
  const transport: OpenRouterTransport = {
    async fetch(_input: string, init: RequestInit): Promise<Response> {
      assertEquals(init.method, "POST");
      const body: BodyInit | null | undefined = init.body;
      if (typeof body !== "string") {
        throw new Error("Expected a JSON request body");
      }
      requestBody = JSON.parse(body) as Record<string, unknown>;
      const modelOutput: Record<string, unknown> = {
        title: "AI Recipe",
        description: null,
        ingredients: [{
          id: "ai-ingredient",
          originalText: "1 cup flour",
          quantity: 1,
          unit: "cup",
          name: "flour",
          notes: null,
          sortOrder: 0,
        }],
        steps: [{
          id: "ai-step",
          instruction: "Bake it.",
          timerDurationMinutes: 10,
          sortOrder: 0,
        }],
        servings: 2,
        prepTimeMinutes: 5,
        cookTimeMinutes: 10,
        totalTimeMinutes: 15,
        images: [],
        cuisineType: null,
        dietaryTags: [],
        parseConfidence: 0.88,
        status: "ready",
      };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(modelOutput) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  };
  const normalizer: OpenRouterNormalizer = new OpenRouterNormalizer({
    api_key: "test-key",
    model: "qwen/qwen3.6-plus",
    timeout_ms: 100,
    transport,
  });

  const draft: NormalizedRecipeDraft = await normalizer.normalize({
    source_url,
    resolved_url: source_url,
    content: "recipe content",
    attempt: 1,
  });
  assertEquals(draft.title, "AI Recipe");
  assertEquals(draft.step_details?.[0]?.id, "ai-step");
  assertEquals(draft.parse_confidence, 0.88);

  const provider: unknown = requestBody?.["provider"];
  const response_format: unknown = requestBody?.["response_format"];
  assertEquals(requestBody?.["model"], "qwen/qwen3.6-plus");
  assertEquals(
    isRecord(provider) ? provider["require_parameters"] : undefined,
    true,
  );
  assertEquals(
    isRecord(response_format) ? response_format["type"] : undefined,
    "json_schema",
  );
  const json_schema: unknown = isRecord(response_format)
    ? response_format["json_schema"]
    : undefined;
  assertEquals(isRecord(json_schema) ? json_schema["strict"] : undefined, true);
});

Deno.test("OpenRouter rejects non-JSON message content as a non-retryable output error", async () => {
  const transport: OpenRouterTransport = {
    fetch(_input: string, _init: RequestInit): Promise<Response> {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "```json {} ```" } }],
          }),
          { status: 200 },
        ),
      );
    },
  };
  const normalizer: OpenRouterNormalizer = new OpenRouterNormalizer({
    api_key: "test-key",
    model: "qwen/qwen3.6-plus",
    transport,
  });

  try {
    await normalizer.normalize({
      source_url,
      resolved_url: source_url,
      content: "recipe content",
      attempt: 1,
    });
    throw new Error("Expected strict JSON validation to fail");
  } catch (error) {
    assertEquals(error instanceof PipelineError, true);
    assertEquals((error as PipelineError).code, "RECIPE_OUTPUT_INVALID");
    assertEquals((error as PipelineError).retryable, false);
  }
});

Deno.test("Supabase gateway maps Auth and all four RPC contracts", async () => {
  const calls: Array<
    { name: string; args: Readonly<Record<string, unknown>> }
  > = [];
  const transport: SupabaseImportTransport = {
    getUser(_access_token: string): Promise<SupabaseCallResult> {
      return Promise.resolve({ data: { user: { id: "user-1" } }, error: null });
    },
    rpc(
      function_name: string,
      args: Readonly<Record<string, unknown>>,
    ): Promise<SupabaseCallResult> {
      calls.push({ name: function_name, args });
      if (function_name === "enqueue_recipe_import") {
        return Promise.resolve({
          data: [{
            job_id: "job-1",
            job_status: "queued",
            recipe_id: null,
            deduplicated: false,
          }],
          error: null,
        });
      }
      if (function_name === "claim_recipe_import") {
        return Promise.resolve({
          data: [{
            message_id: 1,
            job_id: "job-1",
            source_url,
            attempt_number: 1,
            max_attempts: 3,
          }],
          error: null,
        });
      }
      if (function_name === "persist_recipe_import") {
        return Promise.resolve({ data: "recipe-1", error: null });
      }
      return Promise.resolve({ data: "retry_wait", error: null });
    },
    markStage(
      _claim: ClaimedRecipeImport,
      _stage: RecipeImportWorkerStage,
    ): Promise<SupabaseCallResult> {
      return Promise.resolve({ data: null, error: null });
    },
  };
  const gateway: SupabaseRecipeImportGateway = new SupabaseRecipeImportGateway(
    transport,
  );
  assertEquals((await gateway.authenticate("jwt")).id, "user-1");
  assertEquals(
    (await gateway.enqueueRecipeImport({
      user_id: "user-1",
      source_url,
      idempotency_key: "key",
    })).job_id,
    "job-1",
  );
  assertEquals((await gateway.claimRecipeImport(120))?.attempt_number, 1);
  assertEquals(
    (await gateway.persistRecipeImport(
      {
        message_id: 1,
        job_id: "job-1",
        source_url,
        attempt_number: 1,
        max_attempts: 3,
      },
      mapToCanonicalRecipe(
        normalizeRecipeDraft({
          title: "Recipe",
          ingredients: [{
            name: "rice",
            original: "1 cup rice",
            quantity: 1,
            unit: "cup",
            notes: null,
          }],
          steps: ["Cook"],
        }, source_url),
        source_url,
      ),
    ))?.length > 0,
    true,
  );
  assertEquals(
    await gateway.finishRecipeImportError(
      {
        message_id: 1,
        job_id: "job-1",
        source_url,
        attempt_number: 1,
        max_attempts: 3,
      },
      "FETCH_TIMEOUT",
      "timeout",
      true,
      2,
    ),
    "retry_wait",
  );
  assertDeepEquals(calls.map((call): string => call.name), [
    "enqueue_recipe_import",
    "claim_recipe_import",
    "persist_recipe_import",
    "finish_recipe_import_error",
  ]);
  assertEquals(calls[0]?.args["p_user_id"], "user-1");
  assertEquals(calls[3]?.args["p_retry_delay_seconds"], 2);
});

Deno.test("default handler requires an explicit OpenRouter model", () => {
  const values: Map<string, string> = new Map<string, string>([
    ["IMPORT_WORKER_SECRET", worker_secret],
    ["OPENROUTER_API_KEY", "test-key"],
  ]);
  const env = {
    get(name: string): string | undefined {
      return values.get(name);
    },
  };

  try {
    createDefaultHandler({ env, gateway: new FakeGateway() });
    throw new Error("Expected OPENROUTER_MODEL configuration to be required");
  } catch (error) {
    assertEquals(error instanceof Error, true);
    assertEquals(
      error instanceof Error && error.message.includes("OPENROUTER_MODEL"),
      true,
    );
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
