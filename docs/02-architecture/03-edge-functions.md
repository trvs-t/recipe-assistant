# Edge Functions

**Related Docs:** [System Overview](./01-system-overview.md) | [Database Schema](./02-database-schema.md) | [API Contracts](./05-api-contracts.md)

## Overview

Edge Functions are Deno-based serverless functions that handle recipe import, parsing, and validation.

**Location:** `supabase/functions/`

## import-recipe (Consolidated)

Single endpoint that handles URL validation, recipe detection, and AI parsing.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    import-recipe                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  validateUrl │→ │detectRecipe  │→ │ processRecipe    │  │
│  │  (sync)     │  │  (sync)      │  │ (async/waitUntil)│  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                │                    │             │
│         ↓                ↓                    ↓             │
│    Invalid URL      Non-recipe URL      Background AI       │
│    (400 error)      (draft status)      parsing with        │
│                                          OpenRouter         │
└─────────────────────────────────────────────────────────────┘
```

### Interface

**Endpoint:** `POST /functions/v1/import-recipe`

**Request:**
```typescript
interface ImportRecipeRequest {
  url: string;  // Must be valid HTTP/HTTPS URL
}
```

**Response (202 Accepted):**
```typescript
interface ImportRecipeResponse {
  recipe_id: string;  // UUID of created recipe
  status: 'pending' | 'parsing' | 'parsed' | 'draft' | 'error';
}
```

**Status Codes:**
- `202` - Recipe created, parsing in progress
- `400` - Invalid URL or request
- `401` - Authorization required
- `500` - Server error

### Recipe Status Lifecycle

```
pending → parsing → parsed
   ↓         ↓        ↓
 draft    error     (ready)
```

- **pending** - Recipe detected, waiting for background parsing
- **parsing** - AI extraction in progress
- **parsed** - Successfully extracted (title, ingredients, steps)
- **draft** - URL not detected as recipe, can edit manually
- **error** - Parse failed, check `parse_error` field

### Implementation

**File:** `supabase/functions/import-recipe/index.ts`

Key components:

1. **URL Validation** - Format check, content-type, paywall detection
2. **Recipe Detection** - JSON-LD Schema.org Recipe + HTML pattern matching
3. **Background Processing** - `EdgeRuntime.waitUntil()` for async parsing
4. **AI Parsing** - OpenRouter API with retry logic

### Two-Phase Execution

**Phase 1 (Synchronous):**
- Validate URL format and accessibility
- Detect if content is a recipe
- Create recipe record in DB with `pending` or `draft` status
- Return immediately to client

**Phase 2 (Background):**
- Fetch URL and extract content
- Parse with OpenRouter AI (`qwen/qwen3.6-plus-preview:free`)
- Insert ingredients and steps
- Update recipe status to `parsed` or `error`

### EdgeRuntime Note

`EdgeRuntime.waitUntil()` doesn't work in local `supabase functions serve`. The code uses:

```typescript
if (typeof EdgeRuntime !== 'undefined') {
  EdgeRuntime.waitUntil(processRecipeAsync(recipe.id, url))
} else {
  await processRecipeAsync(recipe.id, url)  // Run inline locally
}
```

## Environment Variables

**Required:**
```bash
SUPABASE_URL=https://your-instance.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENROUTER_API_KEY=sk-or-...  # For AI recipe parsing
```

## Testing

**Unit Tests:** `supabase/functions/import-recipe/test.ts`
- 48 tests for URL validation, content detection, HTML parsing
- Run with: `deno test test.ts`

**Integration Tests:** `supabase/functions/import-recipe/integration_test.ts`
- 3 tests that call actual OpenRouter API
- Run with: `deno test --allow-net --allow-env --allow-read integration_test.ts`

## Testing Locally

```bash
# Terminal 1: Start the function server
supabase functions serve import-recipe --no-verify-jwt

# Terminal 2: Call the endpoint
curl -X POST http://127.0.0.1:54321/functions/v1/import-recipe \
  -H "Authorization: Bearer test-token" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.seriouseats.com/recipe"}'
```

## Model Selection

**Current:** `qwen/qwen3.6-plus-preview:free`

**Why:**
- Works out of the box (no "Developer instruction" setting required)
- Free tier available on OpenRouter
- Good at structured JSON extraction

**Avoid:** `google/gemma-3-4b-it:free` - Requires "Developer instruction" enabled in OpenRouter dashboard.

## Learnings

1. **Free tier timeouts** - Supabase Edge Functions free tier has ~25s limit. Use `EdgeRuntime.waitUntil()` for background processing.

2. **Model quirks** - Not all "free" models work identically. Some require dashboard configuration.

3. **JSON extraction** - Models may return content with markdown code blocks or extra text. Robust extraction needed:
   ```typescript
   const jsonMatch = message.match(/```(?:json)?\s*([\s\S]*?)```/)
   const firstChar = parsedContent.indexOf('{')
   const lastChar = parsedContent.lastIndexOf('}')
   ```

4. **Rate limits** - Implement retry with backoff for 429 errors:
   ```typescript
   const MAX_RETRIES = 2
   const RETRY_DELAYS_MS = [1000, 2000]
   ```

## Related Files

| Component | Path |
|-----------|------|
| Import Handler | `supabase/functions/import-recipe/index.ts` |
| Unit Tests | `supabase/functions/import-recipe/test.ts` |
| Integration Tests | `supabase/functions/import-recipe/integration_test.ts` |
| Config | `supabase/config.toml` |

## Deprecated Functions

The following functions are deprecated and should not be used:

- `validate-url/` - Logic merged into `import-recipe`
- `parse-recipe/` - Logic merged into `import-recipe`
