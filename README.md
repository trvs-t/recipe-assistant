# Recipe Assistant

An offline-first Flutter app for saving, scaling, and cooking from online recipes. Save a recipe from any URL, adjust serving sizes with a tap, and follow step-by-step with voice navigation.

## Key Features

- **Save from URL** - Paste any recipe link and have it parsed automatically
- **AI-Powered Parsing** - Extracts ingredients, steps, and timings using OpenAI
- **Serving Size Scaling** - Adjust recipes for more or fewer servings
- **Voice-Guided Cooking** - Navigate steps hands-free with voice commands
- **Offline Support** - Recipes sync and work without internet

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| Flutter 3.41.x | Cross-platform UI |
| Dart 3.11.0 | Language |
| Riverpod 3.x | State management |
| GoRouter 17.x | Navigation |
| Drift 2.x | SQLite local database |
| Freezed | Immutable data classes |
| supabase_flutter | Backend client |

### Backend

| Technology | Purpose |
|------------|---------|
| Supabase | PostgreSQL, Auth, Storage |
| Deno TypeScript | Edge Functions |
| OpenAI API | Recipe parsing |

## Project Structure

```
recipe-assistant/
├── app/                          # Flutter application
│   ├── lib/
│   │   ├── main.dart             # Entry point
│   │   ├── app.dart             # App widget, providers
│   │   ├── config/
│   │   │   ├── routes.dart      # GoRouter setup
│   │   │   ├── theme.dart       # Colors, typography
│   │   │   └── constants.dart   # API endpoints, defaults
│   │   ├── data/
│   │   │   ├── models/          # Freezed data classes
│   │   │   ├── repositories/     # Data access layer
│   │   │   └── services/         # Supabase, speech
│   │   ├── domain/
│   │   │   ├── use_cases/       # Scale recipe, shopping list
│   │   │   └── entities/        # Core business objects
│   │   ├── presentation/
│   │   │   ├── providers/       # Riverpod providers
│   │   │   ├── pages/           # Screen widgets
│   │   │   └── widgets/         # Reusable components
│   │   └── core/
│   │       ├── utils/           # Helpers, formatters
│   │       └── extensions/      # Dart extensions
│   └── test/
├── supabase/
│   ├── functions/                # Edge Functions (Deno)
│   │   ├── validate-url/         # AI recipe validation
│   │   ├── parse-recipe/        # HTML extraction
│   │   └── _shared/             # Shared types
│   ├── migrations/              # SQL migrations
│   └── config.toml             # Supabase config
└── docs/                        # Architecture docs
```

## Getting Started

### Prerequisites

- Flutter 3.41.x or later
- Dart 3.11.0 or later
- Supabase CLI
- Node.js 18+ (for Supabase local development)

### Installation

Clone the repository and install dependencies:

```bash
cd recipe-assistant
cd app
flutter pub get
```

### Code Generation

This project uses code generation for immutable classes and Riverpod providers. Run generators after adding dependencies or modifying model files:

```bash
cd app
dart run build_runner build --delete-conflicting-outputs
```

### Environment Variables

Create a `.env` file in `app/`:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key
```

## Development Commands

```bash
# Type check the Flutter app
cd app && dart analyze

# Run all tests
cd app && flutter test

# Run a single test file
cd app && flutter test test/recipe_repository_test.dart

# Clean and reinstall dependencies
cd app && flutter clean && flutter pub get

# Deploy Edge Functions
supabase functions deploy

# Deploy a single function
supabase functions deploy validate-url
```

## Architecture

### Offline-First Pattern

All data changes go to the local SQLite database first, then sync to Supabase in the background. The app works without internet and queues changes for when connectivity returns.

```
User Action → Local DB → Optimistic UI Update
                     ↓
              Background Sync → Supabase
```

### Repository Pattern

Data access goes through repository interfaces, making the app testable and allowing easy swapping between local-only and remote-backed implementations.

```dart
abstract class IRecipeRepository {
  Future<List<Recipe>> getRecipes();
  Future<Recipe> createRecipe(String url);
  Stream<Recipe> watchRecipe(String id);
}
```

### Riverpod Code Generation

Providers use the code generation approach for type-safe, testable state management:

```dart
@riverpod
class RecipeList extends _$RecipeList {
  @override
  Future<List<Recipe>> build() async {
    return ref.watch(recipeRepositoryProvider).getRecipes();
  }
}
```

### Feature-Based Structure

Code is organized by feature rather than by file type. Each feature has its own models, repositories, providers, and UI components grouped together.

## Key Decisions

### No Barrel Files

Imports are explicit. This makes refactoring easier and keeps dependencies clear. Instead of a central export file, import exactly what you need.

### GoRouter for Navigation

GoRouter handles declarative routing with deep linking support, better for Flutter web, and integrates well with Riverpod.

### Drift for Local Database

Drift (formerly Moor) provides type-safe SQLite access with code generation. It handles the offline-first sync queue and works well with Supabase.

### TypeScript for Edge Functions

Deno-based Edge Functions use TypeScript for type safety. The `_shared` folder holds common types used across functions.

## Documentation

Detailed architecture documentation lives in the `docs/` folder:

| Document | What It Covers |
|----------|---------------|
| [Quick Reference](./docs/00-quick-reference.md) | Cheat sheet, templates, common patterns |
| [Domain Specification](./docs/01-domain-specification.md) | Feature requirements, user stories, data models |
| [System Overview](./docs/02-architecture/01-system-overview.md) | High-level architecture, tech stack choices |
| [Database Schema](./docs/02-architecture/02-database-schema.md) | SQL tables, RLS policies, indexes |
| [Edge Functions](./docs/02-architecture/03-edge-functions.md) | Serverless function specs, parser plugins |
| [Frontend Patterns](./docs/02-architecture/04-frontend-patterns.md) | Riverpod providers, routing, offline strategy |
| [API Contracts](./docs/02-architecture/05-api-contracts.md) | REST endpoints, type definitions |

## Recipe Status Lifecycle

```
pending → parsing → parsed
   ↓         ↓        ↓
 draft    error     (ready)
```

- **pending** - Just saved, waiting for validation
- **parsing** - Validated, extraction in progress
- **parsed** - Successfully extracted, ready to cook
- **draft** - URL invalid or low confidence, can edit manually
- **error** - Parse failed, check `parse_error` field

## Scaling Formula

```
scale_factor = desired_servings / original_servings
scaled_quantity = original_quantity × scale_factor
```

Example: Recipe serves 4 but you need 6:
```
scale_factor = 6 / 4 = 1.5
2 cups flour → 3 cups flour
```

## Contributing

1. Check the docs folder for the feature you want to work on
2. Follow the file naming conventions in the quick reference
3. Run `dart analyze` before submitting
4. Write tests for business logic

## License

Private project. All rights reserved.
