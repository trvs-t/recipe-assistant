# Quick Reference

**One-page cheat sheet for implementation.**

## Implementation Checklist

### New Feature Checklist
- [ ] Update domain model (if needed)
- [ ] Create/update database migration
- [ ] Create/update Edge Function (if backend logic)
- [ ] Create/update Repository class
- [ ] Create/update Provider
- [ ] Create/update UI components
- [ ] Add tests
- [ ] Update documentation

### File Naming
| Component Type | Pattern | Example |
|----------------|---------|---------|
| Edge Function | `{name}/index.ts` | `validate-url/index.ts` |
| Repository | `{name}_repository.dart` | `recipe_repository.dart` |
| Model | `{name}.dart` | `recipe.dart` |
| Provider | `{name}_provider.dart` | `recipe_list_provider.dart` |
| Page | `{name}_page.dart` | `recipe_list_page.dart` |
| Widget | `{name}.dart` | `recipe_card.dart` |

## Quick Lookups

### Recipe Status Lifecycle
```
pending → parsing → parsed
  ↓         ↓        ↓
draft    error     (ready)
```

### Unit Standards
| Volume | Weight | Count |
|--------|--------|-------|
| cup | g | piece |
| tbsp | kg | whole |
| tsp | oz | clove |
| ml | lb | |
| l | | |

### Scaling Formula
```
factor = desired / original
new = original × factor

Example: 4 servings → 6 servings
factor = 6/4 = 1.5x
2 cups flour → 3 cups flour
```

### Scale Factor Reference
| Original | Desired | Factor |
|----------|---------|--------|
| 4 | 2 | 0.5x |
| 4 | 6 | 1.5x |
| 4 | 8 | 2.0x |
| 5 eggs | 3 eggs | 0.6x |

## Code Templates

### Edge Function Template
```typescript
// supabase/functions/{name}/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Request {
  // TODO: Define request fields
}

interface Response {
  // TODO: Define response fields
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: Request = await req.json();
    
    // TODO: Implement logic
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: corsHeaders, status: 500 }
    );
  }
});
```

### Repository Template
```dart
// lib/data/repositories/{name}_repository.dart

abstract class I{Name}Repository {
  // TODO: Define interface methods
}

class {Name}Repository implements I{Name}Repository {
  final SupabaseClient _client;
  
  {Name}Repository(this._client);
  
  // TODO: Implement methods
}
```

### Provider Template
```dart
// lib/presentation/providers/{name}_provider.dart

final {name}RepositoryProvider = Provider<I{Name}Repository>((ref) {
  return {Name}Repository(ref.watch(supabaseClientProvider));
});

final {name}Provider = StateNotifierProvider<{Name}Notifier, AsyncValue<Data>>((ref) {
  return {Name}Notifier(ref.watch({name}RepositoryProvider));
});

class {Name}Notifier extends StateNotifier<AsyncValue<Data>> {
  final I{Name}Repository _repository;
  
  {Name}Notifier(this._repository) : super(const AsyncValue.loading()) {
    load();
  }
  
  Future<void> load() async {
    state = const AsyncValue.loading();
    try {
      final data = await _repository.getData();
      state = AsyncValue.data(data);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }
}
```

## Documentation Navigation

### Architecture
- [System Overview](./02-architecture/01-system-overview.md)
- [Database Schema](./02-architecture/02-database-schema.md)
- [Edge Functions](./02-architecture/03-edge-functions.md)
- [Frontend Patterns](./02-architecture/04-frontend-patterns.md)
- [API Contracts](./02-architecture/05-api-contracts.md)

### Requirements
- [Domain Specification](./01-domain-specification.md) - Functional requirements, data models, user stories
- [Research Findings](./03-research-findings.md) - Technology analysis, patterns

## Environment Setup

### Required Env Vars
```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
```

### File Locations
| What | Where |
|------|-------|
| Edge Functions | `supabase/functions/` |
| Migrations | `supabase/migrations/` |
| Flutter App | `apps/mobile/` |
| Models | `apps/mobile/lib/data/models/` |
| Repositories | `apps/mobile/lib/data/repositories/` |
| Providers | `apps/mobile/lib/presentation/providers/` |
| UI | `apps/mobile/lib/presentation/pages/` |
