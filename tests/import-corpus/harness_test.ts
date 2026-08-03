import {
  type CorpusCase,
  corpusManifest,
  type IIdempotencyCorpusCase,
  type IPageCorpusCase,
  type IPageExpectation,
  type IRedirectCorpusCase,
  type IUrlPolicyCorpusCase,
} from "./manifest.ts";
import {
  evaluateUrlPolicy,
  type IImportV2Result,
  type IOfflineRoute,
  OfflineReferenceAdapter,
  pageRoutes,
  productionUrlAllowed,
  readFixture,
  redirectRoutes,
} from "./harness.ts";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}\nExpected: ${String(expected)}\nActual: ${String(actual)}`,
    );
  }
}

function assertDeepEquals<T>(actual: T, expected: T, message: string): void {
  const actualJson: string = JSON.stringify(actual);
  const expectedJson: string = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`,
    );
  }
}

function assertIncludes(text: string, expected: string, message: string): void {
  if (!text.includes(expected)) {
    throw new Error(`${message}\nMissing: ${expected}\nText: ${text}`);
  }
}

function assertCommonResult(
  result: IImportV2Result,
  sourceUrl: string,
  aiCalls: number,
): void {
  assertEquals(
    result.sourceUrl,
    sourceUrl,
    "The request source URL must be preserved exactly.",
  );
  assertEquals(
    result.aiCalled,
    false,
    "The offline corpus must never call an AI API.",
  );
  assertEquals(aiCalls, 0, "The offline corpus must report zero AI calls.");
  assert(
    result.recordId.length > 0,
    "Every submission must receive a deterministic record ID.",
  );
}

async function runPageCase(corpusCase: IPageCorpusCase): Promise<void> {
  const fixtureBody: string = await readFixture(corpusCase.fixture);
  const adapter: OfflineReferenceAdapter = new OfflineReferenceAdapter(
    pageRoutes(corpusCase, fixtureBody),
  );
  const result: IImportV2Result = await adapter.submit({
    userId: "offline-corpus-user",
    sourceUrl: corpusCase.sourceUrl,
    idempotencyKey: corpusCase.id,
  });
  const metrics = adapter.metrics();
  const expected: IPageExpectation = corpusCase.expected;

  assertCommonResult(result, expected.sourceUrl, metrics.aiCallCount);
  assertEquals(
    result.classification,
    expected.classification,
    `${corpusCase.id}: classification`,
  );
  assertEquals(
    result.terminalState,
    expected.terminalState,
    `${corpusCase.id}: terminal state`,
  );
  assertEquals(
    result.jsonLdBlockCount,
    expected.jsonLdBlockCount,
    `${corpusCase.id}: JSON-LD block count`,
  );
  assertEquals(
    result.malformedJsonLdBlockCount,
    expected.malformedJsonLdBlockCount,
    `${corpusCase.id}: malformed JSON-LD block count`,
  );
  assertEquals(result.redirectCount, 0, `${corpusCase.id}: redirect count`);
  assertEquals(
    metrics.fetchCount,
    corpusCase.expectedFetchCount,
    `${corpusCase.id}: fetch count`,
  );
  assert(
    metrics.fetchCount <= corpusManifest.maxFetchesPerAcceptedSubmission,
    `${corpusCase.id}: fetch budget`,
  );

  if (expected.recipe !== undefined) {
    assert(
      result.recipe !== undefined,
      `${corpusCase.id}: expected a deterministic recipe`,
    );
    assertEquals(
      result.recipe.title,
      expected.recipe.title,
      `${corpusCase.id}: title`,
    );
    assertDeepEquals(
      result.recipe.ingredients,
      expected.recipe.ingredients,
      `${corpusCase.id}: ingredients`,
    );
    assertDeepEquals(
      result.recipe.steps,
      expected.recipe.steps,
      `${corpusCase.id}: steps`,
    );
    assertEquals(
      result.recipe.servings,
      expected.recipe.servings,
      `${corpusCase.id}: servings`,
    );
    assertEquals(
      result.recipe.sourceUrl,
      expected.recipe.sourceUrl,
      `${corpusCase.id}: recipe source URL`,
    );
  } else {
    assert(
      result.recipe === undefined,
      `${corpusCase.id}: AI/unsupported cases must not invent a recipe`,
    );
  }

  for (const expectedText of expected.fallbackTextIncludes ?? []) {
    assert(
      result.fallbackText !== undefined,
      `${corpusCase.id}: fallback text is required`,
    );
    assertIncludes(
      result.fallbackText,
      expectedText,
      `${corpusCase.id}: fallback text`,
    );
  }
}

async function runRedirectCase(corpusCase: IRedirectCorpusCase): Promise<void> {
  assertEquals(
    corpusCase.redirectPolicy,
    corpusManifest.redirectPolicy,
    `${corpusCase.id}: redirect policy`,
  );
  const targetBody: string = await readFixture(
    corpusCase.redirectTargetFixture,
  );
  const adapter: OfflineReferenceAdapter = new OfflineReferenceAdapter(
    redirectRoutes(corpusCase, targetBody),
  );
  const result: IImportV2Result = await adapter.submit({
    userId: "offline-corpus-user",
    sourceUrl: corpusCase.sourceUrl,
    idempotencyKey: corpusCase.id,
  });
  const metrics = adapter.metrics();

  assertCommonResult(
    result,
    corpusCase.expected.sourceUrl,
    metrics.aiCallCount,
  );
  assertEquals(
    result.classification,
    corpusCase.expected.classification,
    `${corpusCase.id}: classification`,
  );
  assertEquals(
    result.terminalState,
    corpusCase.expected.terminalState,
    `${corpusCase.id}: terminal state`,
  );
  assertEquals(
    result.redirectCount,
    corpusCase.expected.redirectCount,
    `${corpusCase.id}: redirect count`,
  );
  assert(result.recipe !== undefined, `${corpusCase.id}: redirected recipe`);
  assertEquals(
    result.recipe.title,
    corpusCase.expected.recipe.title,
    `${corpusCase.id}: redirected title`,
  );
  assertDeepEquals(
    result.recipe.ingredients,
    corpusCase.expected.recipe.ingredients,
    `${corpusCase.id}: redirected ingredients`,
  );
  assertDeepEquals(
    result.recipe.steps,
    corpusCase.expected.recipe.steps,
    `${corpusCase.id}: redirected steps`,
  );
  assertEquals(
    result.recipe.sourceUrl,
    corpusCase.expected.recipe.sourceUrl,
    `${corpusCase.id}: redirected source URL`,
  );
  assertEquals(
    metrics.fetchCount,
    corpusCase.expectedFetchCount,
    `${corpusCase.id}: fetch count`,
  );
  assertDeepEquals(
    metrics.fetchesByUrl,
    corpusCase.expectedFetchesByUrl,
    `${corpusCase.id}: per-URL fetch count`,
  );
}

async function runUrlPolicyCase(
  corpusCase: IUrlPolicyCorpusCase,
): Promise<void> {
  const adapter: OfflineReferenceAdapter = new OfflineReferenceAdapter([]);

  for (const input of corpusCase.inputs) {
    const policy = evaluateUrlPolicy(input.url);
    assertEquals(
      policy.allowed,
      false,
      `${corpusCase.id}: ${input.url} must be rejected`,
    );
    assertEquals(
      policy.reason,
      input.expectedReason,
      `${corpusCase.id}: ${input.url} reason`,
    );
    assertEquals(
      await productionUrlAllowed(input.url),
      false,
      `${corpusCase.id}: production URL policy for ${input.url}`,
    );

    const result: IImportV2Result = await adapter.submit({
      userId: "offline-corpus-user",
      sourceUrl: input.url,
      idempotencyKey: `${corpusCase.id}:${input.url}`,
    });
    assertCommonResult(result, input.url, adapter.metrics().aiCallCount);
    assertEquals(
      result.classification,
      "url_rejected",
      `${corpusCase.id}: ${input.url} classification`,
    );
    assertEquals(
      result.terminalState,
      "error",
      `${corpusCase.id}: ${input.url} terminal state`,
    );
    assertEquals(
      result.errorCode,
      input.expectedReason,
      `${corpusCase.id}: ${input.url} error code`,
    );
  }

  const metrics = adapter.metrics();
  assertEquals(
    metrics.fetchCount,
    corpusCase.expectedFetchCount,
    `${corpusCase.id}: fetch count`,
  );
  assertEquals(
    metrics.aiCallCount,
    corpusCase.expectedAiCalls,
    `${corpusCase.id}: AI count`,
  );
}

async function runIdempotencyCase(
  corpusCase: IIdempotencyCorpusCase,
): Promise<void> {
  assertEquals(
    corpusCase.submissionCount,
    2,
    `${corpusCase.id}: submission count`,
  );
  const fixtureBody: string = await readFixture(corpusCase.fixture);
  const routes: readonly IOfflineRoute[] = [
    {
      url: corpusCase.sourceUrl,
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureBody,
    },
  ];
  const adapter: OfflineReferenceAdapter = new OfflineReferenceAdapter(routes);
  const request = {
    userId: corpusCase.userId,
    sourceUrl: corpusCase.sourceUrl,
    idempotencyKey: corpusCase.idempotencyKey,
  };
  const first: IImportV2Result = await adapter.submit(request);
  const second: IImportV2Result = await adapter.submit(request);
  const metrics = adapter.metrics();

  assertCommonResult(first, corpusCase.expected.sourceUrl, metrics.aiCallCount);
  assertCommonResult(
    second,
    corpusCase.expected.sourceUrl,
    metrics.aiCallCount,
  );
  assertEquals(
    first.duplicate,
    false,
    `${corpusCase.id}: first submission must be new`,
  );
  assertEquals(
    second.duplicate,
    true,
    `${corpusCase.id}: second submission must be duplicate`,
  );
  assertEquals(
    first.recordId,
    second.recordId,
    `${corpusCase.id}: record ID must be reused`,
  );
  assertEquals(
    first.classification,
    corpusCase.expected.classification,
    `${corpusCase.id}: classification`,
  );
  assertEquals(
    first.terminalState,
    corpusCase.expected.terminalState,
    `${corpusCase.id}: terminal state`,
  );
  assertEquals(first.redirectCount, 0, `${corpusCase.id}: redirect count`);
  assertEquals(
    adapter.recordCount(),
    corpusCase.expected.recordCount,
    `${corpusCase.id}: record count`,
  );
  assertEquals(
    metrics.fetchCount,
    corpusCase.expected.expectedFetchCount,
    `${corpusCase.id}: fetch count`,
  );
  assertEquals(
    metrics.aiCallCount,
    corpusCase.expectedAiCalls,
    `${corpusCase.id}: AI count`,
  );
  assert(
    first.recipe !== undefined,
    `${corpusCase.id}: first submission must parse`,
  );
  assert(
    second.recipe !== undefined,
    `${corpusCase.id}: duplicate must return parsed data`,
  );
  assertEquals(
    second.recipe.sourceUrl,
    corpusCase.expected.sourceUrl,
    `${corpusCase.id}: source URL`,
  );
}

async function runCorpusCase(corpusCase: CorpusCase): Promise<void> {
  if (corpusCase.kind === "page") {
    await runPageCase(corpusCase);
    return;
  }

  if (corpusCase.kind === "redirect") {
    await runRedirectCase(corpusCase);
    return;
  }

  if (corpusCase.kind === "url_policy") {
    await runUrlPolicyCase(corpusCase);
    return;
  }

  await runIdempotencyCase(corpusCase);
}

Deno.test("import corpus manifest has required high-signal categories", (): void => {
  const requiredTags: readonly string[] = [
    "json-ld",
    "@graph",
    "multiple-blocks",
    "malformed-json-ld",
    "ai-fallback",
    "unsupported",
    "redirect",
    "ssrf",
    "idempotency",
    "source-url-preservation",
  ];
  const presentTags: Set<string> = new Set<string>();
  for (const corpusCase of corpusManifest.cases) {
    for (const tag of corpusCase.tags) {
      presentTags.add(tag);
    }
  }

  for (const requiredTag of requiredTags) {
    assert(
      presentTags.has(requiredTag),
      `Manifest is missing required tag: ${requiredTag}`,
    );
  }
  assertEquals(corpusManifest.version, 1, "Manifest version");
  assertEquals(corpusManifest.redirectPolicy, "follow", "Redirect policy");
  assertEquals(
    corpusManifest.maxFetchesPerAcceptedSubmission,
    4,
    "Fetch budget",
  );
});

for (const corpusCase of corpusManifest.cases) {
  Deno.test(`import corpus: ${corpusCase.id}`, async (): Promise<void> => {
    await runCorpusCase(corpusCase);
  });
}
