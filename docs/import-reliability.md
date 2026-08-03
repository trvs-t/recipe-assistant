# Import-v2 reliability contract

This document defines the small offline acceptance corpus for the import-v2 rewrite. The corpus is network- and persistence-independent: it provides the typed input/output contract and a deterministic route adapter without importing or changing the current importer entrypoint.

## Run it offline

From the repository root:

```bash
deno fmt --check tests/import-corpus/manifest.ts tests/import-corpus/harness.ts tests/import-corpus/harness_test.ts
deno check tests/import-corpus/manifest.ts tests/import-corpus/harness.ts tests/import-corpus/harness_test.ts
deno test --allow-read tests/import-corpus/harness_test.ts
```

The test command needs read access only. It must not receive `--allow-net`, API keys, Supabase credentials, or an OpenRouter key. A passing run currently reports 10 tests with 0 failures.

## Production failure and recovery coverage

Production importer tests cover OpenRouter network rejection, timeouts,
retryable 408/429/5xx responses, terminal 400/401/402/403 responses, malformed
response envelopes, missing or empty message content, schema-invalid recipe
JSON, durable retry scheduling, and bounded retry exhaustion. Run them with:

```bash
deno test --config supabase/functions/import-recipe-v2/deno.json --no-prompt --allow-net supabase/functions/import-recipe-v2/tests
```

The web recovery states have component tests plus Chromium journeys for fresh
retry and source-URL correction. Run those with `pnpm web:test` and
`pnpm web:test:e2e`.

## Corpus coverage

`tests/import-corpus/manifest.ts` is the source of truth. Every case has a stable ID, tags, source URL, expected terminal state, fetch budget, and expected AI-call count.

| Case | Deterministic assertion |
| --- | --- |
| `structured-direct-recipe` | Direct schema.org Recipe JSON-LD; exact title, ingredients, steps, servings, and preserved request URL |
| `structured-graph-recipe` | Recipe node inside `@graph`, including a JSON-LD `@type` array |
| `structured-multiple-jsonld-blocks` | Three JSON-LD blocks; non-recipe blocks are ignored |
| `malformed-jsonld-recoverable-page-text` | Malformed JSON-LD is counted, visible recipe text is retained, classification is `ai_fallback`, and no AI is called |
| `no-structured-data-ai-fallback` | Recipe-shaped HTML without JSON-LD is classified as `ai_fallback`, not guessed into a structured recipe |
| `unsupported-page` | Non-recipe HTML reaches terminal `error` with `unsupported` classification |
| `redirect-policy-follows-with-bound` | One bounded 302 hop is followed; the source and target are fetched once each, while the original request URL is preserved |
| `ssrf-and-local-network-rejections` | Invalid scheme, credentials, localhost, loopback, link-local, private, and multicast inputs are rejected before fetch |
| `duplicate-submission-idempotent` | Two identical submissions reuse one record, one fetch, one terminal result, and the exact source URL |

The HTML under `tests/import-corpus/fixtures/` is deliberately minimal. The direct fixture’s JSON-LD `url` differs from the request URL so source URL preservation is tested rather than assumed.

## Harness contract

`tests/import-corpus/harness.ts` exposes the adapter seam:

```ts
interface IImportV2Adapter {
  submit(request: IImportV2Request): Promise<IImportV2Result>
  metrics(): IAdapterMetrics
  recordCount(): number
}
```

The current `OfflineReferenceAdapter` uses an in-memory route table and delegates deterministic JSON-LD extraction to `supabase/functions/import-recipe-v2/json-ld-extractor.ts`. It exercises the production URL policy with an in-memory public resolver, but never calls global `fetch`, an AI service, Supabase, real DNS, or a filesystem path outside the fixture directory. A future test-only import-v2 adapter can implement the same seam while keeping the manifest assertions unchanged.

Expected outcome rules:

- A valid Recipe node produces `structured_recipe` and terminal `parsed`, with deterministic normalized fields.
- A malformed or absent structured block with both ingredient and instruction signals produces `ai_fallback` and terminal `draft`. The offline harness asserts classification and fallback text only; it never calls an AI API.
- A page without recipe signals produces `unsupported` and terminal `error`.
- Redirects follow a bounded manual policy. The target is fetched at most within the configured hop limit, and the original request URL remains the source URL used for extraction and persistence.
- Unsafe URLs are rejected before any route fetch. Production URL validation must apply the same literal checks plus DNS resolution/rebinding protection at the egress boundary; the offline corpus intentionally does not perform DNS.
- An idempotency key is scoped to the user. A duplicate returns the original record ID and terminal result without another content fetch or AI call.
- `sourceUrl` is copied from the request exactly. It must not be replaced by a page’s JSON-LD `url`, canonical link, redirect target, or normalized display URL.

The harness uses outcome-level terminal labels (`parsed`, `draft`, `error`). The production adapter maps those outcomes to its durable job statuses; the mapping must still leave every accepted request in a terminal or explicitly retryable state.

## Launch gates

The corpus is a necessary gate, not a substitute for an online canary. Record the following fields for every online submission: `import_id`, a privacy-safe source host hash, `classification`, `terminal_state`, `fetch_count`, `ai_call_count`, `latency_ms`, `error_code`, and `duplicate`.

| Metric | Launch threshold | Measurement |
| --- | --- | --- |
| Offline contract correctness | 100% of corpus tests pass; 0 network/API calls | `deno test --allow-read tests/import-corpus/harness_test.ts` |
| Eligible-page success rate | At least 98% of a release-candidate sample of 100 accessible, recipe-eligible HTML pages reach `parsed`; policy rejects and intentionally unsupported pages are excluded from this denominator | Import result records, grouped by fixture/site and error code |
| State-progress guarantee | Within 30 seconds, 100% of claimed jobs either reach `completed`, `needs_input`, or `failed`, or enter `retry_wait` with a bounded `next_attempt_at`; 0 records remain in an active stage beyond their queue visibility lease | Poll jobs at 30 seconds, reclaim expired queue messages, and reconcile attempt logs |
| Fetch budget | Each attempt makes one initial content fetch plus only the configured redirect hops; the corpus direct cases use one fetch and the one-hop redirect case uses two; SSRF/policy rejects make zero fetches; a duplicate makes zero additional fetches | Egress counter keyed by `import_id` and destination URL |
| Latency | URL-policy rejection p95 ≤ 100 ms; deterministic extraction p95 ≤ 2 s after response receipt; end-to-end accepted import p95 ≤ 15 s; hard timeout at 30 s | Monotonic timer around each phase; report p50/p95 and sample size |
| Error quality | 0 unhandled exceptions; 0 SSRF egresses; ≤ 1% unexpected 5xx/unknown errors; every terminal error has a stable `error_code` | Error logs joined to terminal records |
| Idempotency | 100% of repeated requests with the same user and idempotency key return one record and no additional fetch | Duplicate canary pairs plus the corpus case |

Any gate failure blocks rollout until the failing import ID or a minimized fixture is added to the corpus and the failure is understood. A retry may not turn a stuck record into an accepted result without preserving the terminal-state and fetch-budget metrics.

## Fixture provenance and privacy

- Every fixture is authored from scratch for this repository. It is not copied from a recipe site and contains no copyrighted full page, personal data, account data, tracking identifier, secret, image, form, iframe, external script, or third-party asset.
- `schema.org` appears only as a vocabulary/context URI inside synthetic JSON-LD. All fixture and redirect URLs use reserved `.test` hosts and are never fetched by the harness.
- The malformed JSON-LD, multiple-block ordering, redirect, and local-network strings are minimal reproductions of parser/security shapes, not captures of real pages.
- Keep raw source URLs out of logs and metrics. Hash the host or use a stable fixture ID; never log request credentials or response bodies in production diagnostics.
- If a production incident begins with a real page, do not commit that page. Reduce it to the smallest synthetic HTML that reproduces the parser or policy failure, redact names and values as needed, and add only the relevant shape to this corpus.

## Adding a regression

1. Add a small sanitized HTML file under `tests/import-corpus/fixtures/` when page content is required. Use a descriptive kebab-case filename and reserved `.test` URLs.
2. Add a typed case to `corpusManifest.cases` with a stable ID, one or more tags, exact expected classification/terminal state, JSON-LD and malformed-block counts, source URL, fetch budget, and `expectedAiCalls: 0`.
3. For a deterministic extraction bug, assert exact normalized fields. For an AI-needed bug, assert classification plus the minimum fallback text needed to prove recoverability; never add an API call to the offline harness.
4. For security or transport bugs, include the expected rejection reason and per-URL fetch count. For duplicate bugs, assert record count, record ID reuse, and no additional fetch.
5. Run formatting, type checking, and the offline test command. The new test should fail before the fix and pass after it; do not weaken an existing expectation to make a regression green.
6. Update this document only when the import-v2 contract or launch thresholds change. Keep production implementation changes in their own files; this corpus is limited to `tests/import-corpus/**`.
