# Frontend Patterns

**Related Docs:** [System Overview](./01-system-overview.md) | [Database Schema](./02-database-schema.md) | [API Contracts](./05-api-contracts.md)

## Project Structure

```
lib/
├── main.dart                      # App entry, initialization
├── app.dart                       # App widget, providers setup
├── config/
│   ├── routes.dart               # GoRouter configuration
│   ├── theme.dart                # AppTheme, colors, typography
│   └── constants.dart            # API endpoints, defaults
├── data/
│   ├── models/                   # Freezed data classes
│   │   ├── recipe.dart
│   │   ├── ingredient.dart
│   │   └── step.dart
│   ├── repositories/             # Data access abstraction
│   │   ├── recipe_repository.dart
│   │   └── local_recipe_repository.dart
│   └── services/                 # External service wrappers
│       ├── supabase_client.dart
│       └── speech_service.dart
├── domain/
│   ├── use_cases/                # Business logic
│   │   ├── scale_recipe.dart
│   │   └── generate_shopping_list.dart
│   └── entities/                 # Core business objects
├── presentation/
│   ├── providers/                # Riverpod providers
│   │   ├── recipe_list_provider.dart
│   │   └── recipe_detail_provider.dart
│   ├── pages/                    # Screen widgets
│   │   ├── recipe_list_page.dart
│   │   ├── recipe_detail_page.dart
│   │   └── cooking_mode_page.dart
│   └── widgets/                  # Reusable UI components
│       ├── recipe_card.dart
│       └── ingredient_list.dart
└── core/
    ├── utils/                    # Helpers, formatters
    └── extensions/               # Dart extensions
```

## State Management (Riverpod)

### Provider Patterns

**Async Data Provider:**
```dart
// presentation/providers/recipe_list_provider.dart
import 'package:riverpod/riverpod.dart';

// Repository dependency
final recipeRepositoryProvider = Provider<IRecipeRepository>((ref) {
  return RecipeRepository(ref.watch(supabaseClientProvider));
});

// Async list provider
final recipeListProvider = StateNotifierProvider<RecipeListNotifier, AsyncValue<List<Recipe>>>((ref) {
  return RecipeListNotifier(ref.watch(recipeRepositoryProvider));
});

class RecipeListNotifier extends StateNotifier<AsyncValue<List<Recipe>>> {
  final IRecipeRepository _repository;
  
  RecipeListNotifier(this._repository) : super(const AsyncValue.loading()) {
    loadRecipes();
  }
  
  Future<void> loadRecipes() async {
    state = const AsyncValue.loading();
    try {
      final recipes = await _repository.getRecipes();
      state = AsyncValue.data(recipes);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }
}
```

**Scaled Recipe Provider:**
```dart
// presentation/providers/scaling_provider.dart

// User-selected scale factor
final scaleFactorProvider = StateProvider<double>((ref) => 1.0);

// Computed scaled recipe
final scaledRecipeProvider = Provider.family<ScaledRecipe, String>((ref, recipeId) {
  final recipeAsync = ref.watch(recipeDetailProvider(recipeId));
  final scaleFactor = ref.watch(scaleFactorProvider);
  
  return recipeAsync.whenData((recipe) => 
    ScaleRecipeUseCase().execute(recipe, scaleFactor)
  );
});
```

### Repository Pattern

**Interface:**
```dart
// data/repositories/recipe_repository.dart

abstract class IRecipeRepository {
  Future<List<Recipe>> getRecipes();
  Future<Recipe?> getRecipe(String id);
  Future<Recipe> createRecipe({String? url});
  Future<void> updateRecipe(Recipe recipe);
  Future<void> deleteRecipe(String id);
  Stream<Recipe> watchRecipe(String id);
}
```

**Implementation:**
```dart
class RecipeRepository implements IRecipeRepository {
  final SupabaseClient _client;
  
  RecipeRepository(this._client);
  
  @override
  Future<List<Recipe>> getRecipes() async {
    final response = await _client
      .from('recipes')
      .select('*, ingredients(*), steps(*)')
      .eq('user_id', _client.auth.currentUser!.id)
      .order('created_at');
    
    return (response as List).map((json) => Recipe.fromJson(json)).toList();
  }
  
  @override
  Future<Recipe> createRecipe({String? url}) async {
    final response = await _client
      .from('recipes')
      .insert({
        'user_id': _client.auth.currentUser!.id,
        'source_url': url,
        'status': 'pending',
      })
      .select()
      .single();
    
    return Recipe.fromJson(response);
  }
  
  // TODO: Implement other methods
}
```

## Offline-First Strategy

### Local Database (Drift)

**Setup:**
```dart
// data/local/database.dart
import 'package:drift/drift.dart';

part 'database.g.dart';

@DriftDatabase(tables: [LocalRecipes, LocalIngredients, LocalSteps, SyncQueue])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(_openConnection());
  
  @override
  int get schemaVersion => 1;
}
```

**Tables:**
```dart
// data/local/tables.dart

class LocalRecipes extends Table {
  TextColumn get id => text()();
  TextColumn get userId => text()();
  TextColumn get title => text().nullable()();
  TextColumn get sourceUrl => text().nullable()();
  // ... other fields
  DateTimeColumn get createdAt => dateTime()();
  
  @override
  Set<Column> get primaryKey => {id};
}

class SyncQueue extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get tableName => text()();
  TextColumn get recordId => text()();
  TextColumn get operation => text()(); // 'create', 'update', 'delete'
  TextColumn get data => text()(); // JSON payload
  DateTimeColumn get createdAt => dateTime()();
}
```

**Offline Repository:**
```dart
class OfflineRecipeRepository implements IRecipeRepository {
  final AppDatabase _localDb;
  final IRecipeRepository _remoteRepository;
  final Connectivity _connectivity;
  
  @override
  Future<Recipe> createRecipe({String? url}) async {
    // 1. Generate local ID
    final localId = uuid.v4();
    
    // 2. Save to local DB immediately
    await _localDb.into(_localDb.localRecipes).insert(
      LocalRecipesCompanion(
        id: Value(localId),
        sourceUrl: Value(url),
        status: const Value('pending'),
      ),
    );
    
    // 3. Queue for sync
    await _queueOperation('recipes', localId, 'create', {'url': url});
    
    // 4. Try immediate sync if online
    if (await _isOnline) {
      await _sync();
    }
    
    // 5. Return local recipe
    return _getLocalRecipe(localId);
  }
  
  Future<void> _sync() async {
    final pending = await _localDb.select(_localDb.syncQueue).get();
    
    for (final operation in pending) {
      try {
        await _executeRemoteOperation(operation);
        await _localDb.delete(_localDb.syncQueue).delete(operation);
      } catch (e) {
        // Retry later
        break;
      }
    }
  }
}
```

## Voice Navigation

**Service:**
```dart
// data/services/speech_service.dart
import 'package:speech_to_text/speech_to_text.dart';

enum VoiceCommand {
  nextStep,
  previousStep,
  repeatStep,
  startTimer,
  pauseTimer,
  timerStatus,
  ingredientQuery,
  unknown,
}

class VoiceCommandService {
  final SpeechToText _speech = SpeechToText();
  final StreamController<VoiceCommand> _commandController = 
    StreamController<VoiceCommand>.broadcast();
  
  Stream<VoiceCommand> get commands => _commandController.stream;
  
  Future<bool> initialize() async {
    return await _speech.initialize();
  }
  
  void startListening() async {
    await _speech.listen(
      onResult: (result) => _processCommand(result.recognizedWords),
      listenMode: ListenMode.dictation,
      cancelOnError: false,
    );
  }
  
  void stopListening() {
    _speech.stop();
  }
  
  void _processCommand(String words) {
    final lower = words.toLowerCase();
    
    if (lower.contains('next')) {
      _commandController.add(VoiceCommand.nextStep);
    } else if (lower.contains('previous') || lower.contains('back')) {
      _commandController.add(VoiceCommand.previousStep);
    } else if (lower.contains('repeat')) {
      _commandController.add(VoiceCommand.repeatStep);
    }
    // ... other commands
  }
}
```

**Usage in UI:**
```dart
class CookingModePage extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final voiceService = ref.watch(voiceServiceProvider);
    final currentStep = ref.watch(currentStepProvider);
    
    useEffect(() {
      final subscription = voiceService.commands.listen((command) {
        switch (command) {
          case VoiceCommand.nextStep:
            ref.read(currentStepProvider.notifier).next();
            break;
          case VoiceCommand.previousStep:
            ref.read(currentStepProvider.notifier).previous();
            break;
          // ... handle other commands
        }
      });
      
      return subscription.cancel;
    }, []);
    
    return Scaffold(
      body: GestureDetector(
        onLongPress: voiceService.startListening,
        onLongPressUp: voiceService.stopListening,
        child: StepViewer(step: currentStep),
      ),
    );
  }
}
```

## Navigation (GoRouter)

**Routes:**
```dart
// config/routes.dart
import 'package:go_router/go_router.dart';

final router = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => RecipeListPage(),
    ),
    GoRoute(
      path: '/recipe/:id',
      builder: (context, state) => RecipeDetailPage(
        recipeId: state.params['id']!,
      ),
    ),
    GoRoute(
      path: '/recipe/:id/cook',
      builder: (context, state) => CookingModePage(
        recipeId: state.params['id']!,
      ),
    ),
    GoRoute(
      path: '/add',
      builder: (context, state) => AddRecipePage(),
    ),
  ],
);
```

## UI Patterns

### Recipe Card
```dart
// presentation/widgets/recipe_card.dart

class RecipeCard extends StatelessWidget {
  final Recipe recipe;
  final VoidCallback? onTap;
  
  const RecipeCard({required this.recipe, this.onTap});
  
  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (recipe.images.isNotEmpty)
              RecipeImage(url: recipe.images.first),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(recipe.title, style: Theme.of(context).textTheme.titleLarge),
                  if (recipe.totalTime != null)
                    Text('${recipe.totalTime} min'),
                  if (recipe.servings != null)
                    Text('Serves ${recipe.servings}'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

### Ingredient List with Scaling
```dart
// presentation/widgets/ingredient_list.dart

class ScaledIngredientList extends ConsumerWidget {
  final String recipeId;
  
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scaledRecipe = ref.watch(scaledRecipeProvider(recipeId));
    
    return scaledRecipe.when(
      data: (recipe) => ListView.builder(
        itemCount: recipe.ingredients.length,
        itemBuilder: (context, index) {
          final ingredient = recipe.ingredients[index];
          return ListTile(
            title: Text(ingredient.name),
            subtitle: Text(ingredient.displayQuantity),
          );
        },
      ),
      loading: () => CircularProgressIndicator(),
      error: (e, _) => Text('Error: $e'),
    );
  }
}
```

## Related Files

| Component | Path |
|-----------|------|
| Entry Point | `lib/main.dart` |
| App Widget | `lib/app.dart` |
| Routes | `lib/config/routes.dart` |
| Theme | `lib/config/theme.dart` |
| Recipe Model | `lib/data/models/recipe.dart` |
| Recipe Repository | `lib/data/repositories/recipe_repository.dart` |
| List Provider | `lib/presentation/providers/recipe_list_provider.dart` |
| Recipe Card | `lib/presentation/widgets/recipe_card.dart` |
| Speech Service | `lib/data/services/speech_service.dart` |
