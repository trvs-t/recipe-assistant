import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/models/ingredient.dart';
import 'package:app/data/models/step.dart';
import 'package:app/data/repositories/repositories.dart';

/// Mock implementation of [IRecipeRepository] for testing.
class MockRecipeRepository implements IRecipeRepository {
  final List<Recipe> _recipes = [];
  final _recipeControllers = <String, StreamController<Recipe>>{};

  @override
  Future<List<Recipe>> getRecipes() async => List.unmodifiable(_recipes);

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
}

/// Mock implementation of [IIngredientRepository] for testing.
class MockIngredientRepository implements IIngredientRepository {
  final List<Ingredient> _ingredients = [];

  @override
  Future<List<Ingredient>> getIngredients(String recipeId) async {
    return _ingredients.where((i) => i.recipeId == recipeId).toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  @override
  Future<Ingredient> createIngredient(Ingredient ingredient) async {
    final created = Ingredient(
      id: 'test-ingredient-${_ingredients.length + 1}',
      recipeId: ingredient.recipeId,
      originalText: ingredient.originalText,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      name: ingredient.name,
      notes: ingredient.notes,
      sortOrder: ingredient.sortOrder,
    );
    _ingredients.add(created);
    return created;
  }

  @override
  Future<void> deleteIngredient(String id) async {
    _ingredients.removeWhere((i) => i.id == id);
  }
}

/// Mock implementation of [IStepRepository] for testing.
class MockStepRepository implements IStepRepository {
  final List<Step> _steps = [];

  @override
  Future<List<Step>> getSteps(String recipeId) async {
    return _steps.where((s) => s.recipeId == recipeId).toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  @override
  Future<Step> createStep(Step step) async {
    final created = Step(
      id: 'test-step-${_steps.length + 1}',
      recipeId: step.recipeId,
      instruction: step.instruction,
      timerMinutes: step.timerMinutes,
      sortOrder: step.sortOrder,
    );
    _steps.add(created);
    return created;
  }

  @override
  Future<void> deleteStep(String id) async {
    _steps.removeWhere((s) => s.id == id);
  }
}

void main() {
  group('IRecipeRepository Interface Contract', () {
    late MockRecipeRepository repository;

    setUp(() {
      repository = MockRecipeRepository();
    });

    test('getRecipes returns Future<List<Recipe>>', () async {
      final result = await repository.getRecipes();
      expect(result, isA<List<Recipe>>());
    });

    test('getRecipe returns Future<Recipe>', () async {
      final created = await repository.createRecipe(
        'https://example.com/recipe',
      );
      final result = await repository.getRecipe(created.id);
      expect(result, isA<Recipe>());
      expect(result.id, equals(created.id));
    });

    test('getRecipe throws RecipeNotFoundException for unknown id', () async {
      expect(
        () => repository.getRecipe('non-existent-id'),
        throwsA(isA<RecipeNotFoundException>()),
      );
    });

    test('createRecipe returns Future<Recipe>', () async {
      final result = await repository.createRecipe(
        'https://example.com/recipe',
      );
      expect(result, isA<Recipe>());
      expect(result.status, equals(RecipeStatus.pending));
    });

    test('watchRecipe returns Stream<Recipe>', () {
      final stream = repository.watchRecipe('test-id');
      expect(stream, isA<Stream<Recipe>>());
    });

    test('deleteRecipe returns Future<void>', () async {
      final created = await repository.createRecipe(
        'https://example.com/recipe',
      );
      await repository.deleteRecipe(created.id);
      expect(
        () => repository.getRecipe(created.id),
        throwsA(isA<RecipeNotFoundException>()),
      );
    });
  });

  group('IIngredientRepository Interface Contract', () {
    late MockIngredientRepository repository;

    setUp(() {
      repository = MockIngredientRepository();
    });

    test('getIngredients returns Future<List<Ingredient>>', () async {
      final result = await repository.getIngredients('recipe-id');
      expect(result, isA<List<Ingredient>>());
    });

    test('createIngredient returns Future<Ingredient>', () async {
      final ingredient = Ingredient(
        id: '',
        recipeId: 'recipe-id',
        originalText: '2 cups flour',
        name: 'flour',
        sortOrder: 1,
      );
      final result = await repository.createIngredient(ingredient);
      expect(result, isA<Ingredient>());
      expect(result.id, isNotEmpty);
    });

    test('deleteIngredient returns Future<void>', () async {
      final ingredient = Ingredient(
        id: '',
        recipeId: 'recipe-id',
        originalText: '2 cups flour',
        name: 'flour',
        sortOrder: 1,
      );
      final created = await repository.createIngredient(ingredient);
      await repository.deleteIngredient(created.id);
      final ingredients = await repository.getIngredients('recipe-id');
      expect(ingredients, isEmpty);
    });
  });

  group('IStepRepository Interface Contract', () {
    late MockStepRepository repository;

    setUp(() {
      repository = MockStepRepository();
    });

    test('getSteps returns Future<List<Step>>', () async {
      final result = await repository.getSteps('recipe-id');
      expect(result, isA<List<Step>>());
    });

    test('createStep returns Future<Step>', () async {
      final step = Step(
        id: '',
        recipeId: 'recipe-id',
        instruction: 'Mix ingredients',
        sortOrder: 1,
      );
      final result = await repository.createStep(step);
      expect(result, isA<Step>());
      expect(result.id, isNotEmpty);
    });

    test('deleteStep returns Future<void>', () async {
      final step = Step(
        id: '',
        recipeId: 'recipe-id',
        instruction: 'Mix ingredients',
        sortOrder: 1,
      );
      final created = await repository.createStep(step);
      await repository.deleteStep(created.id);
      final steps = await repository.getSteps('recipe-id');
      expect(steps, isEmpty);
    });
  });

  group('Exception Classes', () {
    test('RecipeNotFoundException has correct message', () {
      final exception = RecipeNotFoundException('recipe-123');
      expect(exception.toString(), contains('recipe-123'));
      expect(exception.toString(), contains('RecipeNotFoundException'));
    });

    test('IngredientNotFoundException has correct message', () {
      final exception = IngredientNotFoundException('ingredient-456');
      expect(exception.toString(), contains('ingredient-456'));
      expect(exception.toString(), contains('IngredientNotFoundException'));
    });

    test('StepNotFoundException has correct message', () {
      final exception = StepNotFoundException('step-789');
      expect(exception.toString(), contains('step-789'));
      expect(exception.toString(), contains('StepNotFoundException'));
    });
  });
}
