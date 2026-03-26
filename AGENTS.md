# AGENTS.md

Guide for AI agents working on the Recipe Assistant codebase.

## Tech Stack

- **Frontend:** Flutter 3.x + Riverpod (state management)
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Local DB:** Drift (SQLite) for offline-first
- **Serverless:** Deno TypeScript Edge Functions
- **AI:** OpenAI API for recipe parsing

## Build & Test Commands

### Flutter
```bash
# Check types (preferred over build/compile)
dart analyze

# Run all tests
flutter test

# Run single test file
flutter test test/recipe_repository_test.dart

# Run specific test
flutter test --name "should create recipe"

# Clean (run from root, not platform folders)
flutter clean
flutter pub get
```

### Supabase
```bash
# Start local Supabase
supabase start

# Run migrations
supabase db push

# Deploy edge functions
supabase functions deploy

# Deploy single function
supabase functions deploy validate-url

# Test edge function locally
curl -X POST http://localhost:54321/functions/v1/validate-url \
  -H "Authorization: Bearer <anon_key>" \
  -d '{"url": "https://example.com"}'
```

## Code Style

### Dart/Flutter
- **Files:** snake_case (e.g., `recipe_repository.dart`)
- **Classes:** PascalCase (e.g., `RecipeRepository`)
- **Variables/functions:** camelCase (e.g., `getRecipes()`)
- **Private:** Leading underscore (e.g., `_client`)
- **Imports:** Use `package:` imports, group: Dart → Flutter → External → Project
- **Types:** Always specify return types and parameter types
- **Riverpod:** Use `Ref` from `riverpod.dart` (not `ProviderNameRef`)

### TypeScript/Deno (Edge Functions)
- **Files:** kebab-case (e.g., `validate-url/index.ts`)
- **Interfaces:** PascalCase with I prefix for abstracts (e.g., `interface IParser`)
- **Types:** Explicit types, avoid `any`
- **Imports:** Use `https://` URLs for Deno std lib

### SQL/PostgreSQL
- **Tables:** snake_case, plural (e.g., `recipes`, `ingredients`)
- **Columns:** snake_case (e.g., `created_at`, `user_id`)
- **RLS:** Always enable on user-data tables
- **Migrations:** Name as `YYYYMMDDHHMMSS_description.sql`

## Architecture Patterns

### Repository Pattern
```dart
// Define interface
abstract class IRecipeRepository { ... }

// Implement with Supabase
class RecipeRepository implements IRecipeRepository {
  final SupabaseClient _client;
  RecipeRepository(this._client);
}
```

### Riverpod Providers
```dart
// Repository provider
final recipeRepositoryProvider = Provider<IRecipeRepository>((ref) => ...);

// State notifier for async data
final recipeProvider = StateNotifierProvider<RecipeNotifier, AsyncValue<Recipe>>(...);
```

### Edge Function Structure
```typescript
// File: supabase/functions/name/index.ts
interface Request { ... }
interface Response { ... }

export default async (req: Request): Promise<Response> => { ... }
```

## Error Handling

### Dart
```dart
try {
  final result = await _client.from('recipes').insert(data);
} on PostgrestException catch (e) {
  // Handle specific Supabase errors
} catch (e, stack) {
  // Log and rethrow or return error state
}
```

### TypeScript
```typescript
try {
  // Operation
} catch (error) {
  return new Response(
    JSON.stringify({ error: error.message }),
    { status: 500 }
  );
}
```

## Key Conventions

1. **Offline-First:** All data changes go to local DB first, then sync to server
2. **RLS:** Every user-data table must have Row Level Security policies
3. **Status Field:** Recipes have status: `pending` → `parsing` → `parsed` | `error` | `draft`
4. **Scaling:** Formula is `new = original × (desired / original_servings)`
5. **Snake Case:** Dart files always use snake_case (CLAUDE.md rule)

## Testing

### Unit Tests
- Test business logic in isolation
- Mock repositories with Mockito
- Test scaling calculations extensively

### Integration Tests
- Test against local Supabase
- Use test fixtures for HTML parsing
- Test offline sync behavior

## Git Conventions

- **Commits:** Conventional commit style (e.g., `feat: add recipe parser`)
- **Branch:** `feature/description` or `fix/description`

## Common Tasks

| Task | Primary Doc | Location |
|------|-------------|----------|
| Add DB table | `docs/02-architecture/02-database-schema.md` | `supabase/migrations/` |
| Create Edge Function | `docs/02-architecture/03-edge-functions.md` | `supabase/functions/` |
| Create Repository | `docs/02-architecture/04-frontend-patterns.md` | `lib/data/repositories/` |
| API Changes | `docs/02-architecture/05-api-contracts.md` | Update types first |

## Quick Reference

- Dart files: snake_case
- Use `dart analyze` not `flutter build`
- Run `flutter clean` from root
- Prefer `ast-grep` for code transformations
- Check docs/ for detailed specifications
