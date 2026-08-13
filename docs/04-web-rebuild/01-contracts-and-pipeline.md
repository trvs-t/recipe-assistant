# Web rebuild: contracts and pipeline

## Locked kickoff decisions

- The frontend is a selective restart in `apps/web`; the Flutter app remains as
  legacy reference until the web vertical slice is accepted.
- The web stack is React, TypeScript, Vite, TanStack Router, TanStack Query,
  Tailwind, and shadcn/ui.
- The existing Supabase recipe schema is retained where it is useful. Local data
  may be erased with `supabase db reset`; no local-data migration path is
  required.
- Every URL import retains its original source URL. Recipe detail always offers
  an external “Open source” link when that URL is present.
- Import reliability and flow visualization are co-equal engineering tracks.

No additional product decision blocks the first vertical slice.

Before a production deployment, choose a pinned OpenRouter model and approve its
cost envelope. `deepseek/deepseek-v4-flash` is pinned in source as the evaluated
low-cost baseline; `openrouter/free` is suitable for cost-constrained local
trials but is not deterministic enough to be the launch baseline. The worker
trigger is now locked: each newly queued submission receives a best-effort
immediate background kick, and a one-minute scheduled pull recovers missed kicks
and expired leases.

## Contract boundary

`packages/recipe-contract` is canonical for web-facing recipe, import-job,
scaling, and graph types. Supabase adapters translate its camelCase API fields
to the existing snake_case tables.

The recipe flow is a directed acyclic graph of step nodes. Ingredient IDs attach
to the step where they are used. Enrichment can express parallel or dependent
work; when enrichment is absent or invalid, the client derives a deterministic
linear graph from `steps.sortOrder`. Visualization failure must not make the
recipe itself unavailable.

## Durable import lifecycle

```text
submit
  -> queued
  -> fetching
  -> extracting
  -> normalizing (full recipe fallback or focused JSON-LD ingredient cleanup)
  -> validating
  -> persisting
  -> completed | needs_input | retry_wait -> queued | failed
```

The submission endpoint validates the public HTTP(S) URL, creates or reuses an
idempotent job, schedules a best-effort background worker kick, and returns
immediately. A one-minute cron invocation is the recovery path. Either trigger
claims jobs with the same queue lease, so duplicate wake-ups are safe. Each
attempt fetches the source once, carries the same response body through all
extractors, and persists the recipe plus ingredients, steps, graph, and final
job state atomically.

Every claimed job must either:

1. renew its lease while active;
2. enter `retry_wait` with a bounded next-attempt time; or
3. reach `completed`, `needs_input`, or `failed`.

An expired lease is reclaimable, so process termination cannot strand a job in
an active state. `waitUntil` may be used only as a best-effort latency shortcut,
never as the source of durability.

## Execution order and gates

1. Contract gate: schemas, status transitions, source URL retention, scaling,
   and linear graph fallback have tests.
2. Foundation gate: the web shell builds with typed file routes and runs without
   production secrets in an explicit demo mode.
3. Import gate: the offline corpus exercises production extraction code; every
   job terminates or becomes retryable; each attempt performs one page fetch.
4. Persistence gate: SQL ownership/RLS, idempotency, leases, graph edges, and an
atomic recipe write are verified against local Supabase.
5. Vertical-slice gate: submit a fixture URL, observe job progress, open the
   resulting recipe, change portions, view the flow, and open the source URL.

## Agent parallelization

Wave 1 uses disjoint ownership: web foundation, import-v2 production core, and
the offline reliability corpus. The coordinator owns this shared contract and
integration. Wave 2 starts only after contract reconciliation: one worker takes
the web recipe/scaling slice, another takes flow visualization, and another
takes persistence/queue adapters. Final QA runs only on the integrated tree.
