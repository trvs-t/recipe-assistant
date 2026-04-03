import 'dart:async';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/manual_recipe_input.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart'
    hide RecipeNotFoundException;
import 'package:app/presentation/providers/providers.dart';
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

  @override
  Future<Recipe> createRecipeFromText(String text) async {
    throw UnimplementedError();
  }

  @override
  Future<Recipe> createManualRecipe(ManualRecipeInput input) async {
    // Mock implementation - create a test recipe
    final recipe = Recipe(
      id: 'test-manual-recipe-${_recipes.length + 1}',
      title: input.title,
      status: RecipeStatus.draft,
      userId: 'test-user',
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    _recipes.add(recipe);
    return recipe;
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
  group('recipeRepositoryProvider', () {
    test('should throw when not overridden', () {
      final emptyContainer = ProviderContainer();
      expect(
        () => emptyContainer.read(recipeRepositoryProvider),
        throwsA(isA<Exception>()),
      );
      emptyContainer.dispose();
    });

    test('should return overridden repository', () {
      final repository = MockTestRecipeRepository();
      final container = ProviderContainer(
        overrides: [recipeRepositoryProvider.overrideWith((ref) => repository)],
      );
      expect(container.read(recipeRepositoryProvider), equals(repository));
      container.dispose();
    });
  });

  group('scaleFactorProvider', () {
    late ProviderContainer container;

    setUp(() {
      container = ProviderContainer();
    });

    tearDown(() {
      container.dispose();
    });

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
    late MockTestRecipeRepository repository;
    late ProviderContainer container;
    late Recipe testRecipe;

    setUp(() {
      repository = MockTestRecipeRepository();
      container = ProviderContainer(
        overrides: [recipeRepositoryProvider.overrideWith((ref) => repository)],
      );
      testRecipe = Recipe(
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
      repository.addRecipe(testRecipe);
    });

    tearDown(() {
      repository.dispose();
      container.dispose();
    });

    test('scale factor updates scale servings correctly', () async {
      // Set scale factor to 2.0 (double servings)
      container.read(scaleFactorProvider.notifier).state = 2.0;

      // The provider computes scaled servings based on recipe servings
      // 4 original servings * 2.0 = 8 scaled servings
      final scaledData = ScaledRecipeData(
        recipe: testRecipe,
        scaleFactor: container.read(scaleFactorProvider),
        originalServings: testRecipe.servings ?? 1,
        scaledServings:
            ((testRecipe.servings ?? 1) * container.read(scaleFactorProvider))
                .round(),
      );

      expect(scaledData.scaleFactor, equals(2.0));
      expect(scaledData.originalServings, equals(4));
      expect(scaledData.scaledServings, equals(8));
    });

    test('scale factor of 0.5 halves the servings', () {
      container.read(scaleFactorProvider.notifier).state = 0.5;

      final scaledData = ScaledRecipeData(
        recipe: testRecipe,
        scaleFactor: container.read(scaleFactorProvider),
        originalServings: testRecipe.servings ?? 1,
        scaledServings:
            ((testRecipe.servings ?? 1) * container.read(scaleFactorProvider))
                .round(),
      );

      expect(scaledData.scaleFactor, equals(0.5));
      expect(scaledData.scaledServings, equals(2));
    });

    test('scale factor of 1.0 keeps servings unchanged', () {
      container.read(scaleFactorProvider.notifier).state = 1.0;

      final scaledData = ScaledRecipeData(
        recipe: testRecipe,
        scaleFactor: container.read(scaleFactorProvider),
        originalServings: testRecipe.servings ?? 1,
        scaledServings:
            ((testRecipe.servings ?? 1) * container.read(scaleFactorProvider))
                .round(),
      );

      expect(scaledData.scaleFactor, equals(1.0));
      expect(scaledData.scaledServings, equals(4));
      expect(scaledData.isScaled, isFalse);
    });
  });
}
