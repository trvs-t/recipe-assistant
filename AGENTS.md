# AGENTS.md

Guide for AI agents working on the Recipe Assistant codebase.

## Tech Stack

- **Frontend:** Flutter 3.41.x + Riverpod 3.x (with code generation)
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Local DB:** Drift 2.x (SQLite) for offline-first
- **Serverless:** Deno TypeScript Edge Functions
- **AI:** OpenRouter API for recipe parsing (free tier: `qwen/qwen3.6-plus-preview:free`)

## Build & Test Commands

### Flutter
```bash
# Type check (ALWAYS use this, never flutter build for type checking)
cd app && dart analyze

# Run all tests
cd app && flutter test

# Run single test file
cd app && flutter test test/unit/recipe_repository_test.dart

# Run specific test by name
cd app && flutter test --name "should create recipe"

# Clean and reinstall
cd app && flutter clean && flutter pub get

# Run code generation (after adding dependencies or modifying models)
cd app && dart run build_runner build --delete-conflicting-outputs
```

### Supabase Edge Functions
```bash
# Start local Supabase (requires Docker)
supabase start

# Apply migrations
supabase db push

# Reset database (recreates and re-applies migrations)
supabase db reset

# Serve function locally (for testing)
supabase functions serve import-recipe --no-verify-jwt

# Deploy single function
supabase functions deploy import-recipe

# Deploy all edge functions
supabase functions deploy

# Generate TypeScript types from local DB
supabase gen types typescript --local > app/lib/data/models/database.types.ts
```

### Edge Function Testing
```bash
cd supabase/functions/import-recipe

# Run unit tests (fast, no external calls)
deno test test.ts

# Run integration tests (calls OpenRouter API, ~2min)
deno test --allow-net --allow-env --allow-read integration_test.ts
```

## Code Style

### Dart/Flutter

**Files:** snake_case (e.g., `recipe_repository.dart`, `i_recipe_repository.dart`)

**Classes:** PascalCase (e.g., `RecipeRepository`, `AppTheme`)

**Variables/functions:** camelCase (e.g., `getRecipes()`, `final List<Recipe> recipes`)

**Private members:** Leading underscore (e.g., `_client`, `_repository`)

**Imports (grouped):**
```dart
// 1. Dart SDK
import 'dart:async';

// 2. Flutter
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// 3. External packages
import 'package:go_router/go_router.dart';
import 'package:freezed_annotation/freezed_annotation.dart';

// 4. Project packages
import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart';
```

**Types:** ALWAYS specify return types and parameter types. Never use `var`.

**Riverpod Code Generation Pattern:**
```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'providers.g.dart';

@riverpod
class RecipeList extends _$RecipeList {
  @override
  Future<List<Recipe>> build() async {
    return ref.watch(recipeRepositoryProvider).getRecipes();
  }
}
```

**Avoid:**
- `as any` type casting
- `@ts-ignore` or `@ts-expect-error`
- Empty catch blocks `catch(e) {}`
- `print()` statements (use debugPrint or logging)

### TypeScript/Deno (Edge Functions)

**Files:** kebab-case (e.g., `validate-url/index.ts`)

**Interfaces:** PascalCase with I prefix (e.g., `interface IRequest`)

**Types:** Explicit types, NEVER use `any`

**Imports:** Use `https://` URLs for Deno std lib

**Error Handling:**
```typescript
try {
  // operation
} catch (error) {
  return new Response(
    JSON.stringify({ error: error.message }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}
```

### SQL/PostgreSQL

**Tables:** snake_case, plural (e.g., `recipes`, `ingredients`)

**Columns:** snake_case (e.g., `created_at`, `user_id`)

**RLS:** ALWAYS enable Row Level Security on user-data tables

**Migrations:** Name as `YYYYMMDDHHMMSS_description.sql`

## Project Structure

```
app/
├── lib/
│   ├── main.dart                    # Entry point with ProviderScope
│   ├── app.dart                     # MaterialApp.router
│   ├── config/                      # Router, theme, constants
│   ├── data/
│   │   ├── models/                 # Freezed data models
│   │   ├── repositories/           # Repository interfaces
│   │   ├── services/               # External services
│   │   └── local/                  # Drift database
│   ├── domain/
│   │   ├── use_cases/             # Business logic
│   │   └── entities/              # Core entities
│   └── presentation/
│       ├── providers/              # Riverpod providers
│       ├── pages/                  # Screen widgets
│       └── widgets/                # Reusable components
└── test/
    ├── unit/                       # Unit tests
    ├── integration/                # Integration tests
    └── widget/                     # Widget tests

supabase/
├── functions/                      # Edge Functions (Deno)
│   ├── import-recipe/             # Consolidated import endpoint
│   │   ├── index.ts               # Main handler
│   │   ├── test.ts                # Unit tests
│   │   └── integration_test.ts     # OpenRouter integration tests
│   └── _shared/                    # Shared types
├── migrations/                     # SQL migrations
└── config.toml
```

## Key Conventions

1. **Offline-First:** Local DB first, then sync to Supabase
2. **RLS:** Every user-data table MUST have Row Level Security
3. **Status Field:** Recipes have status: `pending` → `parsing` → `parsed` | `error` | `draft`
4. **Scaling Formula:** `new = original × (desired / original_servings)`
5. **Code Generation:** Use `riverpod_annotation` + `riverpod_generator` (NOT legacy providers)
6. **Import Recipe Flow:** Single endpoint `import-recipe` handles validation, detection, and parsing

## Error Handling

### Dart
```dart
try {
  final result = await _client.from('recipes').insert(data);
} on PostgrestException catch (e) {
  // Handle specific Supabase errors
  throw RecipeException('Failed to create recipe: ${e.message}');
} catch (e, stack) {
  // Log and rethrow
  logger.severe('Unexpected error', e, stack);
  rethrow;
}
```

### TypeScript
```typescript
try {
  // operation
} catch (error) {
  return new Response(
    JSON.stringify({ error: error.message }),
    { status: 500 }
  );
}
```

## Git Conventions

- **Commits:** Conventional commit style (`feat:`, `fix:`, `chore:`, `docs:`)
- **Branch:** `feature/description` or `fix/description`
- **Never commit:** Generated files (`*.g.dart`, `*.freezed.dart`), `.env` files

## Debugging Methodology

When facing bugs, follow this approach:

### 1. Write Failing Test First
Create a test that **exposes the bug** and prints diagnostic info:
```dart
testWidgets('BUG EXPOSED: issue description', (tester) async {
  // Setup bug reproduction
  await tester.pumpWidget(...);
  // Assert the bug manifestation
  expect(buggyBehavior, isTrue, reason: 'BUG CONFIRMED: ...');
});
```

### 2. Consult Librarian for Unfamiliar Issues
For framework/library behavior you don't understand:
```bash
task(subagent_type="librarian", load_skills=[], prompt="
CONTEXT: [what you're trying to do]
GOAL: [what decision/action the results will unblock]
Find: [specific patterns/examples from official docs or OSS]
")
```
Key triggers: async behavior, retry logic, unfamiliar library APIs.

### 3. Fix Based on Evidence
- Use test output and console errors to identify root cause
- Librarian research provides idiomatic patterns
- Make minimal changes to fix the bug

### Example Flow
1. Bug: "skeleton shows forever" → Write test exposing infinite loading
2. Research: Librarian reveals Riverpod 3.x auto-retries by default
3. Fix: Add `@Riverpod(retry: _noRetry)` to disable retry for this provider
4. Test: Verify error state now appears for missing recipes

## Common Tasks

| Task | Location |
|------|----------|
| Add database table | `supabase/migrations/` + `supabase db push` |
| Create Edge Function | `supabase/functions/` |
| Add Riverpod provider | `lib/presentation/providers/providers.dart` |
| Update API types | `lib/data/models/database.types.ts` |
| Run code generation | `dart run build_runner build --delete-conflicting-outputs` |
| Test Edge Function | `supabase/functions/import-recipe/` |
| Update AI model | `supabase/functions/import-recipe/index.ts` (model variable) |

## CRITICAL RULES

1. ALWAYS run `dart analyze` before committing
2. NEVER commit generated files (`.g.dart`, `.freezed.dart`)
3. NEVER use `as any` or suppress type errors
4. NEVER commit `.env` files or secrets
5. ALWAYS use explicit types (no `var`, no `dynamic`)
6. ALWAYS enable RLS when creating user-data tables

## Quick Reference

- Dart files: snake_case
- Classes: PascalCase
- Private: _prefix
- Use `dart analyze` not `flutter build`
- Run `flutter clean` from app/ directory
- Use `ast-grep` for code transformations
