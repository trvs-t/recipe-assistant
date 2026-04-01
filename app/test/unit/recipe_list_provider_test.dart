import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart';
import 'package:app/presentation/providers/providers.dart';
import 'package:app/presentation/providers/recipe_list_provider.dart';

/// Mock implementation of IRecipeRepository for testing.
class MockRecipeRepository implements IRecipeRepository {
  final List<Recipe> _recipes = [];

  /// Configurable behavior for getRecipes.
  Future<List<Recipe>> Function()? getRecipesBehavior;

  @override
  Future<List<Recipe>> getRecipes() async {
    if (getRecipesBehavior != null) {
      return getRecipesBehavior!();
    }
    return List.unmodifiable(_recipes);
  }

  @override
  Future<Recipe> getRecipe(String id) async {
    final recipe = _recipes.firstWhere(
      (r) => r.id == id,
      orElse: () => throw RecipeNotFoundException(id),
    );
    return recipe;
  }

  @override
  Future<Recipe> createRecipe(String url) async {
    final recipe = Recipe(
      id: 'test-recipe-${_recipes.length + 1}',
      title: 'Test Recipe',
      sourceUrl: url,
      status: RecipeStatus.pending,
      userId: 'test-user',
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    _recipes.add(recipe);
    return recipe;
  }

  @override
  Stream<Recipe> watchRecipe(String id) {
    throw UnimplementedError();
  }

  @override
  Future<void> deleteRecipe(String id) async {
    _recipes.removeWhere((r) => r.id == id);
  }

  /// Adds a recipe for testing.
  void addRecipeForTesting(Recipe recipe) {
    _recipes.add(recipe);
  }
}

void main() {
  group('RecipeList Provider', () {
    late MockRecipeRepository mockRepository;
    late ProviderContainer container;

    setUp(() {
      mockRepository = MockRecipeRepository();
      container = ProviderContainer(
        overrides: [recipeRepositoryProvider.overrideWithValue(mockRepository)],
      );
    });

    tearDown(() {
      container.dispose();
    });

    /// Creates a sample recipe for testing.
    Recipe createTestRecipe({
      String id = 'test-id',
      String title = 'Test Recipe',
      RecipeStatus status = RecipeStatus.parsed,
    }) {
      return Recipe(
        id: id,
        title: title,
        sourceUrl: 'https://example.com/recipe',
        status: status,
        userId: 'test-user',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
    }

    group('initial state', () {
      test('returns AsyncLoading initially', () async {
        // Slow future to ensure we catch the loading state
        mockRepository.getRecipesBehavior = () async {
          await Future.delayed(const Duration(seconds: 10));
          return [];
        };

        final provider = container.read(recipeListProvider);

        expect(provider, isA<AsyncLoading<List<Recipe>>>());
      });

      test('returns AsyncData when recipes load successfully', () async {
        mockRepository.addRecipeForTesting(
          createTestRecipe(id: '1', title: 'Recipe 1'),
        );
        mockRepository.addRecipeForTesting(
          createTestRecipe(id: '2', title: 'Recipe 2'),
        );

        // Wait for the future to complete
        await container.read(recipeListProvider.future);

        final state = container.read(recipeListProvider);
        expect(state, isA<AsyncData<List<Recipe>>>());
        expect(state.value, hasLength(2));
      });
    });

    group('AsyncValue states', () {
      test('handles loading state correctly', () async {
        final completer = Completer<List<Recipe>>();
        mockRepository.getRecipesBehavior = () => completer.future;

        final provider = container.read(recipeListProvider);

        // Should be loading
        expect(provider, isA<AsyncLoading<List<Recipe>>>());
      });

      test('handles data state correctly', () async {
        mockRepository.addRecipeForTesting(createTestRecipe(id: '1'));

        // Wait for completion
        await container.read(recipeListProvider.future);

        final state = container.read(recipeListProvider);
        expect(state, isA<AsyncData<List<Recipe>>>());
        expect(state.value, isNotNull);
        expect(state.value!.length, equals(1));
      });

      test('handles empty list correctly', () async {
        // No recipes added

        // Wait for completion
        await container.read(recipeListProvider.future);

        final state = container.read(recipeListProvider);
        expect(state, isA<AsyncData<List<Recipe>>>());
        expect(state.value, isNotNull);
        expect(state.value, isEmpty);
      });
    });

    group('refreshRecipes', () {
      test('refreshes the recipe list', () async {
        // Add initial recipe
        mockRepository.addRecipeForTesting(createTestRecipe(id: '1'));

        // Wait for initial load
        await container.read(recipeListProvider.future);

        // Add another recipe
        mockRepository.addRecipeForTesting(createTestRecipe(id: '2'));

        // Get the notifier and refresh
        final notifier = container.read(recipeListProvider.notifier);
        await notifier.refreshRecipes();

        // Wait for the refresh to complete
        await container.read(recipeListProvider.future);

        final state = container.read(recipeListProvider);
        expect(state, isA<AsyncData<List<Recipe>>>());
        expect(state.value, hasLength(2));
      });

      test('refreshRecipes invalidates and rebuilds', () async {
        int callCount = 0;
        mockRepository.getRecipesBehavior = () async {
          callCount++;
          return [createTestRecipe(id: 'call-$callCount')];
        };

        // First load
        await container.read(recipeListProvider.future);
        expect(callCount, equals(1));

        // Refresh
        final notifier = container.read(recipeListProvider.notifier);
        await notifier.refreshRecipes();

        // Wait for refresh to complete
        await container.read(recipeListProvider.future);
        expect(callCount, equals(2));
      });
    });

    group('provider overrides', () {
      test('can override recipeRepositoryProvider with mock', () async {
        mockRepository.addRecipeForTesting(
          createTestRecipe(title: 'Mocked Recipe'),
        );

        await container.read(recipeListProvider.future);

        final state = container.read(recipeListProvider);
        expect(state.value!.first.title, equals('Mocked Recipe'));
      });
    });
  });
}
