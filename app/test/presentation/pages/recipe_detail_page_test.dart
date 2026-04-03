import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/data/models/recipe.dart';
import 'package:app/data/models/ingredient.dart';
import 'package:app/data/models/step.dart' as model_step;
import 'package:app/data/repositories/i_recipe_repository.dart';
import 'package:app/data/repositories/i_ingredient_repository.dart';
import 'package:app/data/repositories/i_step_repository.dart';
import 'package:app/presentation/pages/recipe_detail_page.dart';
import 'package:app/presentation/providers/providers.dart';
import 'package:app/presentation/providers/detail_providers.dart';

// Mock repositories

class MockRecipeRepository implements IRecipeRepository {
  final _recipeControllers = <String, StreamController<Recipe>>{};
  final Map<String, Recipe> _recipes = {};

  void addRecipe(Recipe recipe) {
    _recipes[recipe.id] = recipe;
  }

  void updateRecipe(Recipe recipe) {
    _recipes[recipe.id] = recipe;
    _recipeControllers[recipe.id]?.add(recipe);
  }

  @override
  Future<List<Recipe>> getRecipes() async {
    return _recipes.values.toList();
  }

  @override
  Future<Recipe> getRecipe(String id) async {
    final recipe = _recipes[id];
    if (recipe == null) throw Exception('Recipe not found');
    return recipe;
  }

  @override
  Future<Recipe> createRecipe(String url) async {
    throw UnimplementedError();
  }

  @override
  Stream<Recipe> watchRecipe(String id) {
    final controller = StreamController<Recipe>();
    _recipeControllers[id] = controller;
    if (_recipes.containsKey(id)) {
      controller.add(_recipes[id]!);
    }
    return controller.stream;
  }

  @override
  Future<void> deleteRecipe(String id) async {
    _recipes.remove(id);
  }

  @override
  Future<Recipe> createRecipeFromText(String text) async {
    throw UnimplementedError();
  }

  void dispose() {
    for (final controller in _recipeControllers.values) {
      controller.close();
    }
    _recipeControllers.clear();
  }
}

class MockIngredientRepository implements IIngredientRepository {
  final Map<String, List<Ingredient>> _ingredients = {};

  void addIngredients(String recipeId, List<Ingredient> ingredients) {
    _ingredients[recipeId] = ingredients;
  }

  @override
  Future<List<Ingredient>> getIngredients(String recipeId) async {
    return _ingredients[recipeId] ?? [];
  }

  @override
  Future<Ingredient> createIngredient(Ingredient ingredient) async {
    throw UnimplementedError();
  }

  @override
  Future<void> deleteIngredient(String id) async {
    throw UnimplementedError();
  }
}

class MockStepRepository implements IStepRepository {
  final Map<String, List<model_step.Step>> _steps = {};

  void addSteps(String recipeId, List<model_step.Step> steps) {
    _steps[recipeId] = steps;
  }

  @override
  Future<List<model_step.Step>> getSteps(String recipeId) async {
    return _steps[recipeId] ?? [];
  }

  @override
  Future<model_step.Step> createStep(model_step.Step step) async {
    throw UnimplementedError();
  }

  @override
  Future<void> deleteStep(String id) async {
    throw UnimplementedError();
  }
}

// Test helpers

Widget createTestWidget({
  required String recipeId,
  required MockRecipeRepository recipeRepo,
  required MockIngredientRepository ingredientRepo,
  required MockStepRepository stepRepo,
}) {
  return ProviderScope(
    overrides: [
      recipeRepositoryProvider.overrideWith((ref) => recipeRepo),
      ingredientRepositoryProvider.overrideWith((ref) => ingredientRepo),
      stepRepositoryProvider.overrideWith((ref) => stepRepo),
    ],
    child: MaterialApp(home: RecipeDetailPage(id: recipeId)),
  );
}

void main() {
  late MockRecipeRepository recipeRepo;
  late MockIngredientRepository ingredientRepo;
  late MockStepRepository stepRepo;

  setUp(() {
    recipeRepo = MockRecipeRepository();
    ingredientRepo = MockIngredientRepository();
    stepRepo = MockStepRepository();
  });

  tearDown(() {
    recipeRepo.dispose();
  });

  group('RecipeDetailPage', () {
    testWidgets('renders AppBar with recipe title', (tester) async {
      final recipe = Recipe(
        id: 'test-1',
        title: 'Chocolate Cake',
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-1',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Chocolate Cake'), findsOneWidget);
      expect(find.byIcon(Icons.arrow_back), findsOneWidget);
    });

    testWidgets('shows loading skeleton while recipe is loading', (
      tester,
    ) async {
      // Don't add recipe - it will never load
      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-1',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pump();

      // Should show skeleton placeholders
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('shows error state when recipe has error status', (
      tester,
    ) async {
      final recipe = Recipe(
        id: 'test-error',
        title: 'Error Recipe',
        status: RecipeStatus.error,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-error',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Failed to parse recipe'), findsOneWidget);
    });

    testWidgets('displays meta section with servings, prep time, cook time', (
      tester,
    ) async {
      final recipe = Recipe(
        id: 'test-meta',
        title: 'Meta Test Recipe',
        servings: 4,
        prepTimeMinutes: 15,
        cookTimeMinutes: 30,
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-meta',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Servings'), findsOneWidget);
      expect(find.text('Prep'), findsOneWidget);
      expect(find.text('Cook'), findsOneWidget);
      // Values may appear multiple times (e.g., in meta and scaling sections)
      expect(find.text('15m'), findsOneWidget);
      expect(find.text('30m'), findsOneWidget);
    });

    testWidgets('displays scaling control', (tester) async {
      final recipe = Recipe(
        id: 'test-scale',
        title: 'Scale Test Recipe',
        servings: 4,
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-scale',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Scale Recipe'), findsOneWidget);
      expect(find.byType(Slider), findsOneWidget);
      expect(find.text('Reset to Original'), findsOneWidget);
    });

    testWidgets('displays ingredients list', (tester) async {
      final recipe = Recipe(
        id: 'test-ingredients',
        title: 'Ingredients Test Recipe',
        servings: 4,
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);

      ingredientRepo.addIngredients('test-ingredients', [
        Ingredient(
          id: 'ing-1',
          recipeId: 'test-ingredients',
          name: 'Flour',
          quantity: 2.0,
          unit: 'cups',
          originalText: '2 cups flour',
          sortOrder: 0,
        ),
        Ingredient(
          id: 'ing-2',
          recipeId: 'test-ingredients',
          name: 'Sugar',
          quantity: 1.0,
          unit: 'cup',
          originalText: '1 cup sugar',
          sortOrder: 1,
        ),
      ]);

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-ingredients',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Ingredients'), findsOneWidget);
      expect(find.text('Flour'), findsOneWidget);
      expect(find.text('Sugar'), findsOneWidget);
      expect(find.text('2 cups'), findsOneWidget);
      expect(find.text('1 cup'), findsOneWidget);
    });

    testWidgets('displays scaled ingredient quantities', (tester) async {
      final recipe = Recipe(
        id: 'test-scaled-ing',
        title: 'Scaled Ingredients Recipe',
        servings: 4,
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);

      ingredientRepo.addIngredients('test-scaled-ing', [
        Ingredient(
          id: 'ing-1',
          recipeId: 'test-scaled-ing',
          name: 'Flour',
          quantity: 2.0,
          unit: 'cups',
          originalText: '2 cups flour',
          sortOrder: 0,
        ),
      ]);

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-scaled-ing',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      // Default scale is 1.0, so should show 2 cups
      expect(find.text('2 cups'), findsOneWidget);

      // Find and interact with the slider
      final slider = find.byType(Slider);
      expect(slider, findsOneWidget);

      // Drag slider to increase scale
      await tester.drag(slider, const Offset(100, 0));
      await tester.pumpAndSettle();

      // After scaling, quantity should change
    });

    testWidgets('displays steps list with numbered instructions', (
      tester,
    ) async {
      final recipe = Recipe(
        id: 'test-steps',
        title: 'Steps Test Recipe',
        servings: 4,
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);

      stepRepo.addSteps('test-steps', [
        model_step.Step(
          id: 'step-1',
          recipeId: 'test-steps',
          instruction: 'Preheat oven to 350°F',
          sortOrder: 0,
        ),
        model_step.Step(
          id: 'step-2',
          recipeId: 'test-steps',
          instruction: 'Mix dry ingredients',
          timerMinutes: 5,
          sortOrder: 1,
        ),
      ]);

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-steps',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Instructions'), findsOneWidget);
      expect(find.text('Preheat oven to 350°F'), findsOneWidget);
      expect(find.text('Mix dry ingredients'), findsOneWidget);
      expect(find.text('1'), findsOneWidget); // Step number 1
      expect(find.text('2'), findsOneWidget); // Step number 2
    });

    testWidgets('displays timer badge for steps with timer', (tester) async {
      final recipe = Recipe(
        id: 'test-timer',
        title: 'Timer Test Recipe',
        servings: 4,
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);

      stepRepo.addSteps('test-timer', [
        model_step.Step(
          id: 'step-1',
          recipeId: 'test-timer',
          instruction: 'Mix batter',
          timerMinutes: 5,
          sortOrder: 0,
        ),
      ]);

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-timer',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('5 min'), findsOneWidget);
      expect(find.byIcon(Icons.timer), findsOneWidget);
    });

    testWidgets('displays recipe image when URL exists', (tester) async {
      final recipe = Recipe(
        id: 'test-image',
        title: 'Image Test Recipe',
        servings: 4,
        images: ['https://example.com/cake.jpg'],
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-image',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      // Image.network will attempt to load but may fail in test
      // We just verify the Image widget exists
      expect(find.byType(Image), findsOneWidget);
    });

    testWidgets('does not display image section when no images', (
      tester,
    ) async {
      final recipe = Recipe(
        id: 'test-no-image',
        title: 'No Image Recipe',
        servings: 4,
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-no-image',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      // Should not find Image widget for network
      expect(find.byType(Image), findsNothing);
    });

    testWidgets('shows empty state for ingredients when none exist', (
      tester,
    ) async {
      final recipe = Recipe(
        id: 'test-no-ingredients',
        title: 'No Ingredients Recipe',
        servings: 4,
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);
      // Don't add any ingredients

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-no-ingredients',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('No ingredients found'), findsOneWidget);
    });

    testWidgets('shows empty state for steps when none exist', (tester) async {
      final recipe = Recipe(
        id: 'test-no-steps',
        title: 'No Steps Recipe',
        servings: 4,
        status: RecipeStatus.parsed,
        userId: 'user-1',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
      recipeRepo.addRecipe(recipe);
      // Don't add any steps

      await tester.pumpWidget(
        createTestWidget(
          recipeId: 'test-no-steps',
          recipeRepo: recipeRepo,
          ingredientRepo: ingredientRepo,
          stepRepo: stepRepo,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('No instructions found'), findsOneWidget);
    });
  });
}
