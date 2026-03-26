import 'package:app/data/models/ingredient.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/domain/use_cases/recipe_scale_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late RecipeScaleService scaleService;
  late Recipe baseRecipe;
  late List<Ingredient> baseIngredients;

  setUp(() {
    scaleService = RecipeScaleService();
    baseRecipe = Recipe(
      id: 'test-recipe-1',
      title: 'Test Recipe',
      description: 'A test recipe',
      prepTimeMinutes: 15,
      cookTimeMinutes: 30,
      totalTimeMinutes: 45,
      servings: 4,
      status: RecipeStatus.parsed,
      userId: 'user-1',
      createdAt: DateTime(2024, 1, 1),
      updatedAt: DateTime(2024, 1, 1),
    );
    baseIngredients = [
      Ingredient(
        id: 'ing-1',
        recipeId: 'test-recipe-1',
        originalText: '2 cups flour',
        quantity: 2.0,
        unit: 'cup',
        name: 'flour',
        sortOrder: 0,
      ),
      Ingredient(
        id: 'ing-2',
        recipeId: 'test-recipe-1',
        originalText: '1/2 tsp salt',
        quantity: 0.5,
        unit: 'tsp',
        name: 'salt',
        sortOrder: 1,
      ),
      Ingredient(
        id: 'ing-3',
        recipeId: 'test-recipe-1',
        originalText: '3 eggs',
        quantity: 3.0,
        unit: 'piece',
        name: 'eggs',
        sortOrder: 2,
      ),
      Ingredient(
        id: 'ing-4',
        recipeId: 'test-recipe-1',
        originalText: 'pinch of cinnamon',
        quantity: null,
        unit: null,
        name: 'cinnamon',
        sortOrder: 3,
      ),
    ];
  });

  group('RecipeScaleService.scale - Basic scaling', () {
    test('should scale up ingredients correctly (4 -> 6 servings)', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 6,
      );

      // Scale factor: 6/4 = 1.5
      expect(result.recipe.servings, equals(6));
      expect(result.ingredients[0].quantity, equals(3.0)); // 2 * 1.5 = 3
      expect(
        result.ingredients[1].quantity,
        equals(0.75),
      ); // 0.5 * 1.5 = 0.75 (< 1, 2 decimal places)
      expect(result.ingredients[2].quantity, equals(4.5)); // 3 * 1.5 = 4.5
      expect(result.ingredients[3].quantity, isNull); // null stays null
    });

    test('should scale down ingredients correctly (4 -> 2 servings)', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 2,
      );

      // Scale factor: 2/4 = 0.5
      expect(result.recipe.servings, equals(2));
      expect(result.ingredients[0].quantity, equals(1.0)); // 2 * 0.5 = 1
      expect(result.ingredients[1].quantity, equals(0.25)); // 0.5 * 0.5 = 0.25
      expect(result.ingredients[2].quantity, equals(1.5)); // 3 * 0.5 = 1.5
    });

    test('should return same quantities when scaling by 1 (4 -> 4)', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 4,
      );

      expect(result.recipe.servings, equals(4));
      expect(result.ingredients[0].quantity, equals(2.0));
      expect(result.ingredients[1].quantity, equals(0.5));
      expect(result.ingredients[2].quantity, equals(3.0));
    });
  });

  group('RecipeScaleService.scale - Math precision', () {
    test('should round small quantities (< 1) to 2 decimal places', () {
      final ingredients = [
        Ingredient(
          id: 'ing-1',
          recipeId: 'test-recipe-1',
          originalText: '1/3 cup sugar',
          quantity: 0.333,
          unit: 'cup',
          name: 'sugar',
          sortOrder: 0,
        ),
      ];

      // Scaling 4 -> 3 servings (factor = 0.75)
      // 0.333 * 0.75 = 0.24975 -> should round to 0.25
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: ingredients,
        desiredServings: 3,
      );

      expect(result.ingredients[0].quantity, equals(0.25));
    });

    test('should round medium quantities (1-10) to 1 decimal place', () {
      final ingredients = [
        Ingredient(
          id: 'ing-1',
          recipeId: 'test-recipe-1',
          originalText: '2.5 cups flour',
          quantity: 2.5,
          unit: 'cup',
          name: 'flour',
          sortOrder: 0,
        ),
      ];

      // Scaling 4 -> 7 servings (factor = 1.75)
      // 2.5 * 1.75 = 4.375 -> should round to 4.4
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: ingredients,
        desiredServings: 7,
      );

      expect(result.ingredients[0].quantity, equals(4.4));
    });

    test('should round large quantities (>= 10) to whole numbers', () {
      final ingredients = [
        Ingredient(
          id: 'ing-1',
          recipeId: 'test-recipe-1',
          originalText: '8 pieces chicken',
          quantity: 8.0,
          unit: 'piece',
          name: 'chicken',
          sortOrder: 0,
        ),
      ];

      // Scaling 4 -> 16 servings (factor = 4.0)
      // 8 * 4 = 32 -> should stay 32 (already whole)
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: ingredients,
        desiredServings: 16,
      );

      expect(result.ingredients[0].quantity, equals(32.0));
    });

    test('should handle fractional scaling precisely', () {
      final ingredients = [
        Ingredient(
          id: 'ing-1',
          recipeId: 'test-recipe-1',
          originalText: '1 cup milk',
          quantity: 1.0,
          unit: 'cup',
          name: 'milk',
          sortOrder: 0,
        ),
      ];

      // Recipe serves 3, scale to 2 (factor = 0.666...)
      final recipe = baseRecipe.copyWith(servings: 3);

      final result = scaleService.scale(
        recipe: recipe,
        ingredients: ingredients,
        desiredServings: 2,
      );

      // 1 * (2/3) = 0.666... -> should round to 0.67
      expect(result.ingredients[0].quantity, equals(0.67));
    });
  });

  group('RecipeScaleService.scale - Edge cases', () {
    test('should throw when desired servings is 0', () {
      expect(
        () => scaleService.scale(
          recipe: baseRecipe,
          ingredients: baseIngredients,
          desiredServings: 0,
        ),
        throwsA(
          isA<ScalingException>().having(
            (e) => e.message,
            'message',
            contains('must be greater than 0'),
          ),
        ),
      );
    });

    test('should throw when desired servings is negative', () {
      expect(
        () => scaleService.scale(
          recipe: baseRecipe,
          ingredients: baseIngredients,
          desiredServings: -2,
        ),
        throwsA(
          isA<ScalingException>().having(
            (e) => e.message,
            'message',
            contains('must be greater than 0'),
          ),
        ),
      );
    });

    test('should throw when original recipe has null servings', () {
      final recipe = baseRecipe.copyWith(servings: null);

      expect(
        () => scaleService.scale(
          recipe: recipe,
          ingredients: baseIngredients,
          desiredServings: 6,
        ),
        throwsA(
          isA<ScalingException>().having(
            (e) => e.message,
            'message',
            contains('must have servings specified'),
          ),
        ),
      );
    });

    test('should throw when original recipe has 0 servings', () {
      final recipe = baseRecipe.copyWith(servings: 0);

      expect(
        () => scaleService.scale(
          recipe: recipe,
          ingredients: baseIngredients,
          desiredServings: 6,
        ),
        throwsA(
          isA<ScalingException>().having(
            (e) => e.message,
            'message',
            contains('must be greater than 0'),
          ),
        ),
      );
    });

    test('should throw when original recipe has negative servings', () {
      final recipe = baseRecipe.copyWith(servings: -4);

      expect(
        () => scaleService.scale(
          recipe: recipe,
          ingredients: baseIngredients,
          desiredServings: 6,
        ),
        throwsA(
          isA<ScalingException>().having(
            (e) => e.message,
            'message',
            contains('must be greater than 0'),
          ),
        ),
      );
    });

    test('should cap scale factor at 10x and set wasCapped flag', () {
      // Recipe serves 2, want 50 (factor would be 25x)
      final recipe = baseRecipe.copyWith(servings: 2);

      final result = scaleService.scale(
        recipe: recipe,
        ingredients: baseIngredients,
        desiredServings: 50,
      );

      expect(result.wasCapped, isTrue);
      expect(result.originalScaleFactor, equals(25.0));
      // Scaled with 10x cap: 2 cups flour -> 20 cups
      expect(result.ingredients[0].quantity, equals(20.0));
    });

    test('should not cap when scale factor is exactly 10x', () {
      // Recipe serves 2, want 20 (factor is exactly 10x)
      final recipe = baseRecipe.copyWith(servings: 2);

      final result = scaleService.scale(
        recipe: recipe,
        ingredients: baseIngredients,
        desiredServings: 20,
      );

      expect(result.wasCapped, isFalse);
      expect(result.originalScaleFactor, equals(10.0));
    });

    test('should not cap when scale factor is under 10x', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 20, // factor = 5x
      );

      expect(result.wasCapped, isFalse);
      expect(result.originalScaleFactor, equals(5.0));
    });
  });

  group('RecipeScaleService.scale - Immutability', () {
    test('should not modify original recipe object', () {
      final originalServings = baseRecipe.servings;

      scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 8,
      );

      expect(baseRecipe.servings, equals(originalServings));
    });

    test('should not modify original ingredient objects', () {
      final originalQuantities = baseIngredients
          .map((i) => i.quantity)
          .toList();

      scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 8,
      );

      for (var i = 0; i < baseIngredients.length; i++) {
        expect(baseIngredients[i].quantity, equals(originalQuantities[i]));
      }
    });

    test('should not change prepTimeMinutes', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 8,
      );

      expect(result.recipe.prepTimeMinutes, equals(baseRecipe.prepTimeMinutes));
    });

    test('should not change cookTimeMinutes', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 8,
      );

      expect(result.recipe.cookTimeMinutes, equals(baseRecipe.cookTimeMinutes));
    });

    test('should not change totalTimeMinutes', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 8,
      );

      expect(
        result.recipe.totalTimeMinutes,
        equals(baseRecipe.totalTimeMinutes),
      );
    });

    test('should not change other recipe properties', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 8,
      );

      expect(result.recipe.id, equals(baseRecipe.id));
      expect(result.recipe.title, equals(baseRecipe.title));
      expect(result.recipe.description, equals(baseRecipe.description));
      expect(result.recipe.status, equals(baseRecipe.status));
      expect(result.recipe.userId, equals(baseRecipe.userId));
    });

    test('should preserve all ingredient properties except quantity', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 8,
      );

      for (var i = 0; i < baseIngredients.length; i++) {
        final original = baseIngredients[i];
        final scaled = result.ingredients[i];

        expect(scaled.id, equals(original.id));
        expect(scaled.recipeId, equals(original.recipeId));
        expect(scaled.originalText, equals(original.originalText));
        expect(scaled.unit, equals(original.unit));
        expect(scaled.name, equals(original.name));
        expect(scaled.notes, equals(original.notes));
        expect(scaled.sortOrder, equals(original.sortOrder));
      }
    });
  });

  group('RecipeScaleService.scale - Empty ingredients', () {
    test('should handle empty ingredients list', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: [],
        desiredServings: 8,
      );

      expect(result.ingredients, isEmpty);
      expect(result.recipe.servings, equals(8));
    });
  });

  group('RecipeScaleService.scale - Various serving sizes', () {
    test('should handle scaling to 1 serving', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 1,
      );

      // Scale factor: 1/4 = 0.25
      expect(result.recipe.servings, equals(1));
      expect(result.ingredients[0].quantity, equals(0.5)); // 2 * 0.25 = 0.5
      expect(
        result.ingredients[1].quantity,
        equals(0.13),
      ); // 0.5 * 0.25 = 0.125 -> 0.13
      expect(
        result.ingredients[2].quantity,
        equals(0.75),
      ); // 3 * 0.25 = 0.75 (< 1, 2 decimal places)
    });

    test('should handle scaling to large serving (100)', () {
      final result = scaleService.scale(
        recipe: baseRecipe,
        ingredients: baseIngredients,
        desiredServings: 100,
      );

      // Scale factor: 100/4 = 25, capped at 10
      expect(result.wasCapped, isTrue);
      expect(result.ingredients[0].quantity, equals(20)); // 2 * 10 = 20
      expect(result.ingredients[1].quantity, equals(5)); // 0.5 * 10 = 5
      expect(result.ingredients[2].quantity, equals(30)); // 3 * 10 = 30
    });
  });
}
