# API Contracts

**Related Docs:** [System Overview](./01-system-overview.md) | [Edge Functions](./03-edge-functions.md) | [Frontend Patterns](./04-frontend-patterns.md)

## REST API (Supabase PostgREST)

Base URL: `https://<your-instance>.supabase.co/rest/v1`

Authentication: Bearer token in `Authorization` header

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /recipes?user_id=eq.{id}&select=*,ingredients(*),steps(*) | List recipes with relations |
| GET | /recipes?id=eq.{id} | Get single recipe |
| POST | /recipes | Create recipe |
| PATCH | /recipes?id=eq.{id} | Update recipe |
| DELETE | /recipes?id=eq.{id} | Delete recipe |
| GET | /ingredients?recipe_id=eq.{id} | Get ingredients for recipe |
| GET | /steps?recipe_id=eq.{id} | Get steps for recipe |

**Note:** Creating a recipe with `source_url` automatically triggers parsing via database webhook.

## Edge Functions

### validate-url

**Endpoint:** POST /functions/v1/validate-url

**Request Interface:**
```typescript
interface ValidateUrlRequest {
  url: string;  // Required. Valid HTTP/HTTPS URL
}
```

**Response Interface (Success):**
```typescript
interface ValidateUrlResponse {
  valid: boolean;
  confidence: number;        // 0.0 - 1.0
  method?: 'schema' | 'ai';  // Detection method
  reason?: string;           // If valid: false
}
```

**Status Codes:**
- 200 - Validation complete (check valid field)
- 400 - Malformed request
- 401 - Unauthorized
- 500 - Server error

### parse-recipe

**Endpoint:** POST /functions/v1/parse-recipe

**Request Interface:**
```typescript
interface ParseRecipeRequest {
  recipe_id: string;  // UUID of recipe record
  url: string;        // URL to parse
}
```

**Response Interface:**
```typescript
interface ParseRecipeResponse {
  success: boolean;
  parser: 'allrecipes' | 'bbcgoodfood' | 'schema' | 'ai';
  ingredientCount: number;
  stepCount: number;
}
```

**Side Effects:**
- Updates recipes table
- Inserts ingredients and steps
- Sets status to 'parsed' or 'error'

## Realtime Subscriptions

Subscribe to recipe changes via WebSocket:

```javascript
// Subscribe to user recipes
supabase
  .channel('recipes')
  .on('postgres_changes', {
    event: '*',
    table: 'recipes',
    filter: `user_id=eq.${userId}`
  }, callback)
  .subscribe();
```

## Core Types

### TypeScript

```typescript
interface Recipe {
  id: string;
  user_id: string;
  title: string | null;
  source_url: string | null;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  total_time_minutes: number | null;
  servings: number | null;
  images: string[];
  cuisine_type: string | null;
  dietary_tags: string[];
  status: 'pending' | 'parsing' | 'parsed' | 'draft' | 'error';
  parse_confidence: number | null;
  parse_error: string | null;
  created_at: string;
  updated_at: string;
}

interface Ingredient {
  id: string;
  recipe_id: string;
  original_text: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  sort_order: number;
}

interface Step {
  id: string;
  recipe_id: string;
  instruction: string;
  timer_duration_minutes: number | null;
  sort_order: number;
}
```

### Dart (Freezed)

```dart
@freezed
class Recipe with _$Recipe {
  const factory Recipe({
    required String id,
    required String userId,
    String? title,
    String? sourceUrl,
    String? description,
    int? prepTimeMinutes,
    int? cookTimeMinutes,
    int? totalTimeMinutes,
    int? servings,
    @Default([]) List<String> images,
    String? cuisineType,
    @Default([]) List<String> dietaryTags,
    @Default('pending') String status,
    double? parseConfidence,
    String? parseError,
    required DateTime createdAt,
    required DateTime updatedAt,
  }) = _Recipe;

  factory Recipe.fromJson(Map<String, dynamic> json) => 
    _$RecipeFromJson(json);
}
```

## Error Handling

### Standard Error Format
```json
{
  "error": "error_code",
  "message": "Human-readable description",
  "details": {}
}
```

### Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| invalid_request | 400 | Malformed request |
| unauthorized | 401 | Authentication required |
| forbidden | 403 | Permission denied |
| not_found | 404 | Resource not found |
| parse_error | 422 | Parse failed |
| internal_error | 500 | Server error |

## Related Files

| Component | Path |
|-----------|------|
| TypeScript Types | `supabase/functions/_shared/types.ts` |
| Dart Models | `apps/mobile/lib/data/models/` |
| Edge Functions | `supabase/functions/validate-url/index.ts` |
| | `supabase/functions/parse-recipe/index.ts` |
