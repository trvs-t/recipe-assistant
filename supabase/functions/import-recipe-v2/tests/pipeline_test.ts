import { classifyErrorForRetry, PipelineError } from "../errors.ts";
import { normalizeRecipeDraft } from "../ai-normalizer.ts";
import { type ImportPipelineDependencies, runImport } from "../pipeline.ts";
import {
  type AiNormalizationAdapter,
  type ImportLogEvent,
  type NormalizedRecipeDraft,
  type SourceDocument,
  type SourceFetcher,
} from "../types.ts";
import { assert, assertDeepEquals, assertEquals } from "./assertions.ts";
import {
  MemoryPersistence,
  RecordingLogger,
  sourceDocument,
} from "./test-support.ts";

const source_url: string = "https://recipes.example/recipe";

function dependencies(
  source_fetcher: SourceFetcher,
  ai_normalizer: AiNormalizationAdapter,
  persistence: MemoryPersistence,
  logger: RecordingLogger,
): ImportPipelineDependencies {
  return {
    source_fetcher,
    ai_normalizer,
    persistence,
    logger,
    sleep: async (_milliseconds: number): Promise<void> => undefined,
  };
}

function jsonLdHtml(): string {
  const jsonLd: string = JSON.stringify({
    "@type": "Recipe",
    name: "JSON-LD Curry",
    recipeIngredient: ["1 cup rice"],
    recipeInstructions: ["Cook the rice."],
  });
  return `<script type="application/ld+json">${jsonLd}</script>`;
}

function aiDraft(): NormalizedRecipeDraft {
  return {
    title: "AI Pancakes",
    description: null,
    ingredients: [{
      original: "1 cup flour",
      quantity: 1,
      unit: "cup",
      name: "flour",
      notes: null,
    }],
    steps: ["Mix and cook."],
    servings: 2,
    prep_time_minutes: 5,
    cook_time_minutes: 10,
    image_url: null,
  };
}

Deno.test("uses deterministic JSON-LD first and retains source_url", async () => {
  let fetchCalls: number = 0;
  let aiCalls: number = 0;
  const source_fetcher: SourceFetcher = {
    async fetch(
      _source_url: string,
      _attempt: number,
    ): Promise<SourceDocument> {
      fetchCalls += 1;
      return sourceDocument(source_url, jsonLdHtml());
    },
  };
  const ai_normalizer: AiNormalizationAdapter = {
    async normalize(_input): Promise<NormalizedRecipeDraft> {
      aiCalls += 1;
      throw new Error("AI fallback must not run for JSON-LD");
    },
  };
  const persistence: MemoryPersistence = new MemoryPersistence();
  const logger: RecordingLogger = new RecordingLogger();
  const result = await runImport(
    { source_url, idempotency_key: "json-ld-key" },
    dependencies(source_fetcher, ai_normalizer, persistence, logger),
    { max_attempts: 1 },
  );

  assertEquals(result.record.job.status, "completed");
  assertEquals(fetchCalls, 1);
  assertEquals(aiCalls, 0);
  assertEquals(result.record.recipe?.source_url, source_url);
  assertEquals(result.record.recipe?.title, "JSON-LD Curry");
  assertDeepEquals(
    persistence.transitions.map((transition): string => transition.next_status),
    ["fetching", "extracting", "normalizing", "persisting"],
  );
  assert(
    logger.events.every((event: ImportLogEvent): boolean =>
      event.stage.length > 0 && event.attempt >= 1
    ),
    "Every log event must carry stage and attempt fields",
  );
});

Deno.test("uses the injectable AI adapter only when JSON-LD is unavailable", async () => {
  let aiCalls: number = 0;
  const source_fetcher: SourceFetcher = {
    async fetch(
      _source_url: string,
      _attempt: number,
    ): Promise<SourceDocument> {
      return sourceDocument(
        source_url,
        "<html><body>Ingredients and steps</body></html>",
      );
    },
  };
  const ai_normalizer: AiNormalizationAdapter = {
    async normalize(input): Promise<NormalizedRecipeDraft> {
      aiCalls += 1;
      assertEquals(input.source_url, source_url);
      assertEquals(input.resolved_url, source_url);
      return aiDraft();
    },
  };
  const persistence: MemoryPersistence = new MemoryPersistence();
  const logger: RecordingLogger = new RecordingLogger();
  const result = await runImport(
    { source_url, idempotency_key: "ai-key" },
    dependencies(source_fetcher, ai_normalizer, persistence, logger),
    { max_attempts: 1 },
  );

  assertEquals(result.record.job.status, "completed");
  assertEquals(aiCalls, 1);
  assertEquals(result.record.recipe?.source_url, source_url);
  assertEquals(result.record.recipe?.title, "AI Pancakes");
});

Deno.test("fetches once per attempt and retries bounded transient failures", async () => {
  let fetchCalls: number = 0;
  const attempts: number[] = [];
  const source_fetcher: SourceFetcher = {
    async fetch(_source_url: string, attempt: number): Promise<SourceDocument> {
      fetchCalls += 1;
      attempts.push(attempt);
      if (fetchCalls === 1) {
        throw new PipelineError({
          code: "FETCH_TIMEOUT",
          message: "temporary timeout",
          stage: "fetch",
          retryable: true,
        });
      }
      return sourceDocument(source_url, jsonLdHtml());
    },
  };
  const ai_normalizer: AiNormalizationAdapter = {
    async normalize(_input): Promise<NormalizedRecipeDraft> {
      throw new Error("AI fallback must not run");
    },
  };
  const persistence: MemoryPersistence = new MemoryPersistence();
  const logger: RecordingLogger = new RecordingLogger();
  const result = await runImport(
    { source_url, idempotency_key: "retry-key" },
    dependencies(source_fetcher, ai_normalizer, persistence, logger),
    { max_attempts: 2, retry_delays_ms: [0] },
  );

  assertEquals(result.record.job.status, "completed");
  assertEquals(fetchCalls, 2);
  assertEquals(attempts[0], 1);
  assertEquals(attempts[1], 2);
  assert(
    logger.events.some((event: ImportLogEvent): boolean =>
      event.event === "retry_scheduled"
    ),
    "Expected retry log",
  );
});

Deno.test("always terminalizes after retry exhaustion and prevents a stuck active job", async () => {
  let fetchCalls: number = 0;
  const source_fetcher: SourceFetcher = {
    async fetch(
      _source_url: string,
      _attempt: number,
    ): Promise<SourceDocument> {
      fetchCalls += 1;
      throw new PipelineError({
        code: "FETCH_NETWORK_ERROR",
        message: "connection reset",
        stage: "fetch",
        retryable: true,
      });
    },
  };
  const ai_normalizer: AiNormalizationAdapter = {
    async normalize(_input): Promise<NormalizedRecipeDraft> {
      return aiDraft();
    },
  };
  const persistence: MemoryPersistence = new MemoryPersistence();
  const logger: RecordingLogger = new RecordingLogger();
  const result = await runImport(
    { source_url, idempotency_key: "stuck-job-key" },
    dependencies(source_fetcher, ai_normalizer, persistence, logger),
    { max_attempts: 2, retry_delays_ms: [0] },
  );

  assertEquals(fetchCalls, 2);
  assertEquals(result.record.job.status, "failed");
  assertEquals(persistence.recordForKey("stuck-job-key").job.status, "failed");
  assertEquals(result.record.job.last_error?.code, "FETCH_NETWORK_ERROR");
  const lastEvent: ImportLogEvent | undefined =
    logger.events[logger.events.length - 1];
  assertEquals(lastEvent?.status, "failed");
});

Deno.test("recovers a previously active job back to pending before resuming", async () => {
  const persistence: MemoryPersistence = new MemoryPersistence();
  const created = await persistence.createOrGetJob({
    source_url,
    idempotency_key: "recovery-key",
    user_id: null,
  });
  await persistence.transition({
    job_id: created.record.job.id,
    expected_status: "pending",
    next_status: "fetching",
    attempt: 1,
    last_error: null,
  });

  const source_fetcher: SourceFetcher = {
    fetch(_source_url: string, _attempt: number): Promise<SourceDocument> {
      return Promise.resolve(sourceDocument(source_url, jsonLdHtml()));
    },
  };
  const ai_normalizer: AiNormalizationAdapter = {
    normalize(_input): Promise<NormalizedRecipeDraft> {
      return Promise.resolve(aiDraft());
    },
  };
  const logger: RecordingLogger = new RecordingLogger();
  const result = await runImport(
    { source_url, idempotency_key: "recovery-key" },
    dependencies(source_fetcher, ai_normalizer, persistence, logger),
    { max_attempts: 2 },
  );

  assertEquals(result.record.job.status, "completed");
  assertEquals(result.record.job.attempt, 2);
  assertEquals(persistence.transitions[1]?.next_status, "pending");
});

Deno.test("maps invalid normalized output to needs_input instead of leaving normalizing active", async () => {
  const source_fetcher: SourceFetcher = {
    async fetch(
      _source_url: string,
      _attempt: number,
    ): Promise<SourceDocument> {
      return sourceDocument(source_url, "<html>not structured data</html>");
    },
  };
  const ai_normalizer: AiNormalizationAdapter = {
    async normalize(_input): Promise<NormalizedRecipeDraft> {
      return {
        ...aiDraft(),
        title: "",
        ingredients: [],
        steps: [],
      };
    },
  };
  const persistence: MemoryPersistence = new MemoryPersistence();
  const logger: RecordingLogger = new RecordingLogger();
  const result = await runImport(
    { source_url, idempotency_key: "needs-input-key" },
    dependencies(source_fetcher, ai_normalizer, persistence, logger),
    { max_attempts: 1 },
  );

  assertEquals(result.record.job.status, "needs_input");
  assertEquals(result.record.job.last_error?.code, "RECIPE_OUTPUT_INVALID");
});

Deno.test("reuses a terminal result for the same idempotency key without refetching", async () => {
  let fetchCalls: number = 0;
  const source_fetcher: SourceFetcher = {
    async fetch(
      _source_url: string,
      _attempt: number,
    ): Promise<SourceDocument> {
      fetchCalls += 1;
      return sourceDocument(source_url, jsonLdHtml());
    },
  };
  const ai_normalizer: AiNormalizationAdapter = {
    async normalize(_input): Promise<NormalizedRecipeDraft> {
      return aiDraft();
    },
  };
  const persistence: MemoryPersistence = new MemoryPersistence();
  const logger: RecordingLogger = new RecordingLogger();
  const first = await runImport(
    { source_url, idempotency_key: "idempotent-key" },
    dependencies(source_fetcher, ai_normalizer, persistence, logger),
    { max_attempts: 1 },
  );
  const second = await runImport(
    { source_url, idempotency_key: "idempotent-key" },
    dependencies(source_fetcher, ai_normalizer, persistence, logger),
    { max_attempts: 1 },
  );

  assertEquals(first.record.job.id, second.record.job.id);
  assertEquals(second.reused, true);
  assertEquals(fetchCalls, 1);
});

Deno.test("classifies retryable and non-retryable failures explicitly", () => {
  const retryable: PipelineError = new PipelineError({
    code: "HTTP_STATUS_ERROR",
    message: "server error",
    stage: "fetch",
    retryable: true,
  });
  const nonRetryable: PipelineError = new PipelineError({
    code: "SSRF_BLOCKED",
    message: "private host",
    stage: "fetch",
    retryable: false,
  });
  assertEquals(classifyErrorForRetry(retryable).retryable, true);
  assertEquals(classifyErrorForRetry(nonRetryable).retryable, false);
  assertEquals(classifyErrorForRetry(nonRetryable).code, "SSRF_BLOCKED");
});

Deno.test("normalization always overwrites adapter source_url with the requested source", () => {
  const draft: NormalizedRecipeDraft = {
    ...aiDraft(),
    source_url: "https://redirected.example/recipe",
  };
  const recipe = normalizeRecipeDraft(draft, source_url);
  assertEquals(recipe.source_url, source_url);
});
