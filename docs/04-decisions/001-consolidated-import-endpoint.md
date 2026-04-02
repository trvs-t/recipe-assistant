# ADR-001: Consolidated Import-Recipe Endpoint

**Status:** Accepted

**Date:** 2026-04-02

## Context

The original architecture used a multi-step client-orchestrated approach:
1. Client → `validate-url` (AI-based recipe detection)
2. Client → `parse-recipe` (HTML extraction + AI parsing)
3. Client → DB updates between each step

This created complexity, multiple network round-trips, and tight coupling between Flutter client and Edge Function logic.

## Decision

Consolidate into single `import-recipe` endpoint with Two-Phase execution:

**Phase 1 (Synchronous):**
- Validate URL (format, content-type, paywall)
- Detect recipe (JSON-LD Schema.org + HTML patterns)
- Create DB record with `pending` or `draft` status
- Return immediately with `recipe_id`

**Phase 2 (Background via EdgeRuntime.waitUntil):**
- Fetch URL and extract content
- Parse with OpenRouter AI
- Insert ingredients and steps
- Update status to `parsed` or `error`

## Rationale

1. **Simpler client** - Single endpoint call, subscribe to DB changes via Realtime
2. **Less network chatter** - One round-trip instead of 3+
3. **Backend orchestration** - Edge Function handles timing, client just waits
4. **Offline-friendly** - Client can work offline after initial save

## Alternatives Considered

**Option 1: Keep separate functions**
- Rejected: Complexity of client orchestration
- Rejected: Multiple network failures points

**Option 2: Background workers queue (BullMQ, etc.)**
- Rejected: Additional infrastructure
- Rejected: Supabase doesn't natively support this

**Option 3: Client polls for status**
- Rejected: Inefficient polling
- Chosen instead: Supabase Realtime subscription

## Consequences

**Positive:**
- Single endpoint to maintain
- Client complexity reduced
- Better offline handling
- Realtime updates via Supabase

**Negative:**
- Longer initial request time (background processing)
- Requires Realtime publication setup
- Debugging harder with async split

## Implementation Notes

- Use `EdgeRuntime.waitUntil()` for background processing
- Fall back to inline execution when `EdgeRuntime === undefined` (local dev)
- Implement retry with backoff for rate limits
- Use `qwen/qwen3.6-plus-preview:free` model (works out of box)

## Related

- [Edge Functions](./03-edge-functions.md)
- [import-recipe source](../../supabase/functions/import-recipe/index.ts)
