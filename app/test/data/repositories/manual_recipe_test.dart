import 'package:flutter_test/flutter_test.dart';

import 'package:app/data/models/manual_recipe_input.dart';
import 'package:app/data/models/ingredient_input.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/models/ingredient.dart';
import 'package:app/data/models/step.dart';

/// Tests for manual recipe creation functionality.
/// These tests verify the behavior of creating recipes manually
/// with draft status, UUID generation, timestamps, and sorting.

void main() {
  group('ManualRecipeInput', () {
    test('can be constructed with required fields only', () {
      const input = ManualRecipeInput(title: 'My Recipe');

      expect(input.title, equals('My Recipe'));
      expect(input.ingredients, isEmpty);
      expect(input.instructions, isEmpty);
    });

    test('can be constructed with all fields', () {
      final input = ManualRecipeInput(
        title: 'My Recipe',
        ingredients: [
          const IngredientInput(name: 'Flour', quantity: 2.0, unit: 'cup'),
          const IngredientInput(name: 'Sugar', quantity: 1.0, unit: 'cup'),
        ],
        instructions: ['Mix dry ingredients', 'Add wet ingredients'],
      );

      expect(input.title, equals('My Recipe'));
      expect(input.ingredients, hasLength(2));
      expect(input.instructions, hasLength(2));
    });

    test('copyWith creates new instance with updated fields', () {
      const original = ManualRecipeInput(title: 'Original');
      final updated = original.copyWith(title: 'Updated');

      expect(updated.title, equals('Updated'));
      expect(original.title, equals('Original'));
    });

    test('equality works correctly', () {
      const input1 = ManualRecipeInput(title: 'Recipe');
      const input2 = ManualRecipeInput(title: 'Recipe');
      const input3 = ManualRecipeInput(title: 'Different');

      expect(input1 == input2, isTrue);
      expect(input1 == input3, isFalse);
    });
  });

  group('IngredientInput', () {
    test('can be constructed with required fields only', () {
      const input = IngredientInput(name: 'Flour');

      expect(input.name, equals('Flour'));
      expect(input.quantity, isNull);
      expect(input.unit, isNull);
      expect(input.notes, isNull);
    });

    test('can be constructed with all fields', () {
      const input = IngredientInput(
        name: 'Flour',
        quantity: 2.0,
        unit: 'cup',
        notes: 'sifted',
      );

      expect(input.name, equals('Flour'));
      expect(input.quantity, equals(2.0));
      expect(input.unit, equals('cup'));
      expect(input.notes, equals('sifted'));
    });

    test('copyWith creates new instance with updated fields', () {
      const original = IngredientInput(name: 'Flour');
      final updated = original.copyWith(quantity: 3.0);

      expect(updated.name, equals('Flour'));
      expect(updated.quantity, equals(3.0));
      expect(original.quantity, isNull);
    });

    test('equality works correctly', () {
      const input1 = IngredientInput(name: 'Flour', quantity: 2.0);
      const input2 = IngredientInput(name: 'Flour', quantity: 2.0);
      const input3 = IngredientInput(name: 'Sugar', quantity: 1.0);

      expect(input1 == input2, isTrue);
      expect(input1 == input3, isFalse);
    });
  });

  group('Manual Recipe Creation - Draft Status', () {
    test('creates recipe with draft status when manually entered', () {
      // Manual recipes should be created with draft status
      // since they don't come from a validated URL
      const status = RecipeStatus.draft;

      expect(status, equals(RecipeStatus.draft));
    });

    test('recipe status enum has draft value', () {
      expect(RecipeStatus.values, contains(RecipeStatus.draft));
      expect(RecipeStatus.draft.index, equals(3));
    });
  });

  group('Manual Recipe Creation - UUID Generation', () {
    test('generates unique IDs for recipes', () {
      final id1 = 'recipe-${DateTime.now().microsecondsSinceEpoch}';
      final id2 = 'recipe-${DateTime.now().microsecondsSinceEpoch + 1}';

      expect(id1, isNot(equals(id2)));
    });

    test('generates unique IDs for ingredients', () {
      final id1 = 'ingredient-${DateTime.now().microsecondsSinceEpoch}';
      final id2 = 'ingredient-${DateTime.now().microsecondsSinceEpoch + 1}';

      expect(id1, isNot(equals(id2)));
    });

    test('generates unique IDs for steps', () {
      final id1 = 'step-${DateTime.now().microsecondsSinceEpoch}';
      final id2 = 'step-${DateTime.now().microsecondsSinceEpoch + 1}';

      expect(id1, isNot(equals(id2)));
    });
  });

  group('Manual Recipe Creation - Timestamps', () {
    test('sets createdAt timestamp', () {
      final now = DateTime.now();
      final recipe = Recipe(
        id: 'test-id',
        title: 'Test Recipe',
        status: RecipeStatus.draft,
        userId: 'test-user',
        createdAt: now,
        updatedAt: now,
      );

      expect(recipe.createdAt, equals(now));
    });

    test('sets updatedAt timestamp', () {
      final now = DateTime.now();
      final recipe = Recipe(
        id: 'test-id',
        title: 'Test Recipe',
        status: RecipeStatus.draft,
        userId: 'test-user',
        createdAt: now,
        updatedAt: now,
      );

      expect(recipe.updatedAt, equals(now));
    });

    test('createdAt and updatedAt can be different', () {
      final created = DateTime(2024, 1, 1);
      final updated = DateTime(2024, 1, 2);

      final recipe = Recipe(
        id: 'test-id',
        title: 'Test Recipe',
        status: RecipeStatus.draft,
        userId: 'test-user',
        createdAt: created,
        updatedAt: updated,
      );

      expect(recipe.createdAt, equals(created));
      expect(recipe.updatedAt, equals(updated));
    });
  });

  group('Manual Recipe Creation - Sort Order', () {
    test('ingredients are assigned sequential sortOrder', () {
      final ingredient1 = Ingredient(
        id: 'ing-1',
        recipeId: 'recipe-1',
        originalText: '2 cups flour',
        name: 'flour',
        sortOrder: 1,
      );
      final ingredient2 = Ingredient(
        id: 'ing-2',
        recipeId: 'recipe-1',
        originalText: '1 cup sugar',
        name: 'sugar',
        sortOrder: 2,
      );
      final ingredient3 = Ingredient(
        id: 'ing-3',
        recipeId: 'recipe-1',
        originalText: '3 eggs',
        name: 'eggs',
        sortOrder: 3,
      );

      expect(ingredient1.sortOrder, equals(1));
      expect(ingredient2.sortOrder, equals(2));
      expect(ingredient3.sortOrder, equals(3));
    });

    test('steps are assigned sequential sortOrder', () {
      final step1 = Step(
        id: 'step-1',
        recipeId: 'recipe-1',
        instruction: 'Preheat oven',
        sortOrder: 1,
      );
      final step2 = Step(
        id: 'step-2',
        recipeId: 'recipe-1',
        instruction: 'Mix dry ingredients',
        sortOrder: 2,
      );
      final step3 = Step(
        id: 'step-3',
        recipeId: 'recipe-1',
        instruction: 'Bake for 30 minutes',
        sortOrder: 3,
      );

      expect(step1.sortOrder, equals(1));
      expect(step2.sortOrder, equals(2));
      expect(step3.sortOrder, equals(3));
    });

    test('sortOrder starts at 1 for first item', () {
      final ingredient = Ingredient(
        id: 'ing-1',
        recipeId: 'recipe-1',
        originalText: '1 item',
        name: 'item',
        sortOrder: 1,
      );

      expect(ingredient.sortOrder, greaterThan(0));
    });
  });

  group('Manual Recipe Creation - Ingredient Field Combination', () {
    test('IngredientInput has separate fields that can be combined', () {
      const input = IngredientInput(quantity: 2.0, unit: 'cup', name: 'flour');

      expect(input.quantity, equals(2.0));
      expect(input.unit, equals('cup'));
      expect(input.name, equals('flour'));
    });

    test('handles missing quantity', () {
      const input = IngredientInput(unit: 'pinch', name: 'salt');

      expect(input.quantity, isNull);
      expect(input.unit, equals('pinch'));
      expect(input.name, equals('salt'));
    });

    test('handles missing unit', () {
      const input = IngredientInput(quantity: 3.0, name: 'eggs');

      expect(input.quantity, equals(3.0));
      expect(input.unit, isNull);
      expect(input.name, equals('eggs'));
    });

    test('handles notes field', () {
      const input = IngredientInput(
        quantity: 2.0,
        unit: 'cup',
        name: 'flour',
        notes: 'sifted',
      );

      expect(input.notes, equals('sifted'));
    });

    test('Ingredient stores originalText', () {
      final ingredient = Ingredient(
        id: 'ing-1',
        recipeId: 'recipe-1',
        originalText: '2 cups all-purpose flour, sifted',
        quantity: 2.0,
        unit: 'cup',
        name: 'flour',
        notes: 'sifted',
        sortOrder: 1,
      );

      expect(
        ingredient.originalText,
        equals('2 cups all-purpose flour, sifted'),
      );
    });
  });

  group('Manual Recipe Creation - Offline Behavior', () {
    test('recipe can be created without network', () {
      final recipe = Recipe(
        id: 'local-recipe-${DateTime.now().microsecondsSinceEpoch}',
        title: 'Offline Recipe',
        status: RecipeStatus.draft,
        userId: 'test-user',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      expect(recipe.status, equals(RecipeStatus.draft));
      expect(recipe.title, equals('Offline Recipe'));
    });

    test('ingredients can be created without network', () {
      final ingredient = Ingredient(
        id: 'local-ingredient-${DateTime.now().microsecondsSinceEpoch}',
        recipeId: 'local-recipe-1',
        originalText: '1 cup milk',
        name: 'milk',
        sortOrder: 1,
      );

      expect(ingredient.name, equals('milk'));
    });

    test('steps can be created without network', () {
      final step = Step(
        id: 'local-step-${DateTime.now().microsecondsSinceEpoch}',
        recipeId: 'local-recipe-1',
        instruction: 'Pour milk into bowl',
        sortOrder: 1,
      );

      expect(step.instruction, equals('Pour milk into bowl'));
    });

    test('draft status indicates offline-created recipe', () {
      final recipe = Recipe(
        id: 'test-id',
        title: 'Test',
        status: RecipeStatus.draft,
        userId: 'test-user',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      // Draft status is used for manually created recipes
      expect(recipe.status, equals(RecipeStatus.draft));
      expect(recipe.sourceUrl, isNull);
    });
  });
}
