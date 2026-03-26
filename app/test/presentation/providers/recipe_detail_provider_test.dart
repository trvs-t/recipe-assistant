import 'dart:async';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart'
    hide RecipeNotFoundException;
import 'package:app/presentation/providers/recipe_detail_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// --- Mock Repository for testing ---

/// A mock implementation of [IRecipeRepository] for testing providers.
class MockTestRecipeRepository implements IRecipeRepository {
  final List<Recipe> _recipes = [];
  final _recipeControllers = <String, StreamController<Recipe>>{};

  @override
  Future<List<Recipe>> getRecipes() async {
    return List.unmodifiable(_recipes);
  }

  @override
  Future<Recipe> getRecipe(String id) async {
    final recipe = _recipes.firstWhere(
      (r) => r.id == id,
      orElse: () => throw RecipeNotFoundException(recipeId: id),
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
    final controller = _recipeControllers.putIfAbsent(
      id,
      () => StreamController<Recipe>.broadcast(),
    );
    return controller.stream;
  }

  @override
  Future<void> deleteRecipe(String id) async {
    _recipes.removeWhere((r) => r.id == id);
  }

  /// Adds a recipe to the mock repository.
  void addRecipe(Recipe recipe) {
    _recipes.add(recipe);
  }

  /// Simulates a recipe update being broadcast to watchers.
  void updateRecipe(Recipe recipe) {
    final controller = _recipeControllers[recipe.id];
    controller?.add(recipe);
  }

  /// Simulates an error being broadcast to watchers.
  void errorRecipe(String id, Object error) {
    final controller = _recipeControllers[id];
    controller?.addError(error);
  }

  /// Disposes all stream controllers.
  void dispose() {
    for (final controller in _recipeControllers.values) {
      controller.close();
    }
    _recipeControllers.clear();
  }
}

void main() {
  late MockTestRecipeRepository repository;
  late ProviderContainer container;

  setUp(() {
    repository = MockTestRecipeRepository();
    container = ProviderContainer(
      overrides: [recipeRepositoryProvider.overrideWith((ref) => repository)],
    );
  });

  tearDown(() {
    repository.dispose();
    container.dispose();
  });

  group('recipeRepositoryProvider', () {
    test('should throw UnimplementedError when not overridden', () {
      final emptyContainer = ProviderContainer();
      expect(
        () => emptyContainer.read(recipeRepositoryProvider),
        throwsA(isA<UnimplementedError>()),
      );
      emptyContainer.dispose();
    });

    test('should return overridden repository', () {
      final repo = container.read(recipeRepositoryProvider);
      expect(repo, equals(repository));
    });
  });

  group('RecipeDetail (stream provider)', () {
    test('should emit recipe updates via stream', () async {
      final recipe = Recipe(
        id: 'test-1',
        title: 'Original Title',
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );

      repository.addRecipe(recipe);

      final stream = container.read(recipeDetailProvider('test-1'));
      expect(stream, isA<Stream<Recipe>>());

      // Wait for the stream to emit
      await expectLater(stream, emits(recipe));
    });

    test('should emit error when recipe not found', () async {
      final stream = container.read(recipeDetailProvider('non-existent'));

      await expectLater(stream, emitsError(isA<RecipeNotFoundException>()));
    });

    test('should receive updates when recipe changes', () async {
      final originalRecipe = Recipe(
        id: 'test-2',
        title: 'Original',
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );

      final updatedRecipe = originalRecipe.copyWith(
        title: 'Updated Title',
        updatedAt: DateTime(2024, 1, 2),
      );

      repository.addRecipe(originalRecipe);

      final stream = container.read(recipeDetailProvider('test-2'));

      await expectLater(stream, emitsInOrder([originalRecipe, updatedRecipe]));

      // Simulate update
      repository.updateRecipe(updatedRecipe);
    });
  });

  group('scaleFactorProvider', () {
    test('should have default value of 1.0', () {
      final factor = container.read(scaleFactorProvider);
      expect(factor, equals(1.0));
    });

    test('should update scale factor using state', () {
      container.read(scaleFactorProvider.notifier).state = 2.0;
      expect(container.read(scaleFactorProvider), equals(2.0));
    });

    test('should handle fractional scale factors', () {
      container.read(scaleFactorProvider.notifier).state = 1.5;
      expect(container.read(scaleFactorProvider), equals(1.5));
    });

    test('should handle scale factor less than 1', () {
      container.read(scaleFactorProvider.notifier).state = 0.5;
      expect(container.read(scaleFactorProvider), equals(0.5));
    });

    test('should reset to 1.0 when reset', () {
      container.read(scaleFactorProvider.notifier).state = 3.0;
      container.read(scaleFactorProvider.notifier).state = 1.0;
      expect(container.read(scaleFactorProvider), equals(1.0));
    });
  });

  group('ScaledRecipe (computed provider)', () {
    late Recipe testRecipe;

    setUp(() {
      testRecipe = Recipe(
        id: 'scaled-test',
        title: 'Scaling Test Recipe',
        status: RecipeStatus.parsed,
        servings: 4,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      repository.addRecipe(testRecipe);
    });

    test('should return AsyncValue with recipe and scale data', () async {
      final scaledRecipeAsync = container.read(
        scaledRecipeProvider('scaled-test'),
      );

      await expectLater(scaledRecipeAsync, isA<AsyncData<ScaledRecipeData>>());

      final data = container.read(scaledRecipeProvider('scaled-test')).value!;
      expect(data.recipe, equals(testRecipe));
      expect(data.scaleFactor, equals(1.0));
      expect(data.originalServings, equals(4));
      expect(data.scaledServings, equals(4));
      expect(data.isScaled, isFalse);
    });

    test('should compute scaled servings with factor 2.0', () async {
      container.read(scaleFactorProvider.notifier).state = 2.0;

      final data = container.read(scaledRecipeProvider('scaled-test')).value!;

      expect(data.scaleFactor, equals(2.0));
      expect(data.originalServings, equals(4));
      expect(data.scaledServings, equals(8));
      expect(data.isScaled, isTrue);
    });

    test('should compute scaled servings with factor 0.5', () async {
      container.read(scaleFactorProvider.notifier).state = 0.5;

      final data = container.read(scaledRecipeProvider('scaled-test')).value!;

      expect(data.scaleFactor, equals(0.5));
      expect(data.originalServings, equals(4));
      expect(data.scaledServings, equals(2));
      expect(data.isScaled, isTrue);
    });

    test('should round scaled servings to nearest integer', () async {
      container.read(scaleFactorProvider.notifier).state = 1.5;

      final data = container.read(scaledRecipeProvider('scaled-test')).value!;

      // 4 * 1.5 = 6
      expect(data.scaledServings, equals(6));
    });

    test('should handle null servings in recipe', () async {
      final recipeNoServings = testRecipe.copyWith(servings: null);
      repository.addRecipe(recipeNoServings);

      // Reset scale factor
      container.read(scaleFactorProvider.notifier).state = 1.0;

      final data = container.read(scaledRecipeProvider('scaled-test')).value!;

      // Null servings should default to 1
      expect(data.originalServings, equals(1));
      expect(data.scaledServings, equals(1));
    });

    test('should update when recipe updates via repository', () async {
      final updatedRecipe = testRecipe.copyWith(
        title: 'Updated Title',
        servings: 6,
      );

      // Update the recipe in the repository
      repository.updateRecipe(updatedRecipe);

      // Wait for the update to be processed
      await Future.delayed(const Duration(milliseconds: 100));

      // The scaled recipe provider should reflect the updated recipe
      final data = container.read(scaledRecipeProvider('scaled-test')).value!;
      expect(data.recipe.title, equals('Updated Title'));
      expect(data.originalServings, equals(6));
    });

    test('should propagate error state from recipe stream', () async {
      // Create a fresh container for error testing
      final errorContainer = ProviderContainer(
        overrides: [recipeRepositoryProvider.overrideWith((ref) => repository)],
      );

      // Set up error on the repository
      repository.errorRecipe(
        'error-test',
        const NetworkException(message: 'Network error', retryable: true),
      );

      // Wait for error to propagate
      await Future.delayed(const Duration(milliseconds: 100));

      final asyncValue = errorContainer.read(
        scaledRecipeProvider('error-test'),
      );
      expect(asyncValue, isA<AsyncError>());

      errorContainer.dispose();
    });
  });

  group('ScaledRecipeData', () {
    late Recipe testRecipeForData;

    setUp(() {
      testRecipeForData = Recipe(
        id: 'data-test',
        title: 'Data Test Recipe',
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
    });

    test('isScaled returns false when factor is 1.0', () {
      final data = ScaledRecipeData(
        recipe: testRecipeForData,
        scaleFactor: 1.0,
        originalServings: 4,
        scaledServings: 4,
      );
      expect(data.isScaled, isFalse);
    });

    test('isScaled returns true when factor is not 1.0', () {
      final data = ScaledRecipeData(
        recipe: testRecipeForData,
        scaleFactor: 2.0,
        originalServings: 4,
        scaledServings: 8,
      );
      expect(data.isScaled, isTrue);
    });

    test('isScaled returns true when factor is less than 1.0', () {
      final data = ScaledRecipeData(
        recipe: testRecipeForData,
        scaleFactor: 0.5,
        originalServings: 4,
        scaledServings: 2,
      );
      expect(data.isScaled, isTrue);
    });
  });

  group('Integration: Recipe with Scaling', () {
    test('full scaling workflow', () async {
      final recipe = Recipe(
        id: 'integration-test',
        title: 'Integration Test Recipe',
        description: 'A recipe for integration testing',
        prepTimeMinutes: 15,
        cookTimeMinutes: 30,
        totalTimeMinutes: 45,
        servings: 4,
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );

      repository.addRecipe(recipe);

      // Initial state - no scaling
      var data = container
          .read(scaledRecipeProvider('integration-test'))
          .value!;
      expect(data.isScaled, isFalse);
      expect(data.scaledServings, equals(4));

      // Scale up to 8 servings (2x)
      container.read(scaleFactorProvider.notifier).state = 2.0;
      data = container.read(scaledRecipeProvider('integration-test')).value!;
      expect(data.isScaled, isTrue);
      expect(data.scaledServings, equals(8));
      expect(data.recipe.servings, equals(4)); // Original unchanged

      // Scale down to 2 servings (0.5x)
      container.read(scaleFactorProvider.notifier).state = 0.5;
      data = container.read(scaledRecipeProvider('integration-test')).value!;
      expect(data.scaledServings, equals(2));

      // Reset to no scaling
      container.read(scaleFactorProvider.notifier).state = 1.0;
      data = container.read(scaledRecipeProvider('integration-test')).value!;
      expect(data.isScaled, isFalse);
      expect(data.scaledServings, equals(4));
    });
  });
}
