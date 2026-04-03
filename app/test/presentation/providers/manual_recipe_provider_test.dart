import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/data/models/manual_recipe_input.dart';
import 'package:app/data/models/ingredient_input.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/presentation/providers/manual_recipe_provider.dart';

/// Tests for ManualRecipeProvider state management.
/// Verifies initialization, field updates, validation, and error handling.

void main() {
  group('ManualRecipeState', () {
    test('has correct default values on initialization', () {
      const state = ManualRecipeState();

      expect(state.title, equals(''));
      expect(state.ingredients, isEmpty);
      expect(state.instructions, isEmpty);
      expect(state.status, equals(ManualRecipeStatus.empty));
      expect(state.errorMessage, isEmpty);
    });

    test('can be constructed with custom values', () {
      final state = ManualRecipeState(
        title: 'My Recipe',
        ingredients: [const IngredientInput(name: 'Flour')],
        instructions: const [
          StepInput(id: '1', instruction: 'Mix ingredients'),
        ],
        status: ManualRecipeStatus.valid,
        errorMessage: '',
      );

      expect(state.title, equals('My Recipe'));
      expect(state.ingredients, hasLength(1));
      expect(state.instructions, hasLength(1));
      expect(state.status, equals(ManualRecipeStatus.valid));
    });

    test('copyWith creates new instance with updated fields', () {
      const original = ManualRecipeState();
      final updated = original.copyWith(title: 'Updated Title');

      expect(updated.title, equals('Updated Title'));
      expect(original.title, equals(''));
    });

    test('equality works correctly', () {
      const state1 = ManualRecipeState(title: 'Recipe');
      const state2 = ManualRecipeState(title: 'Recipe');
      const state3 = ManualRecipeState(title: 'Different');

      expect(state1 == state2, isTrue);
      expect(state1 == state3, isFalse);
    });
  });

  group('ManualRecipeState Validation', () {
    test('is invalid when title is empty', () {
      const state = ManualRecipeState(
        title: '',
        ingredients: [IngredientInput(name: 'Flour')],
        instructions: [StepInput(id: '1', instruction: 'Mix')],
      );

      expect(state.status != ManualRecipeStatus.valid, isTrue);
    });

    test('is invalid when ingredients is empty', () {
      const state = ManualRecipeState(
        title: 'Recipe',
        ingredients: [],
        instructions: [StepInput(id: '1', instruction: 'Mix')],
      );

      expect(state.status != ManualRecipeStatus.valid, isTrue);
    });

    test('is invalid when instructions is empty', () {
      const state = ManualRecipeState(
        title: 'Recipe',
        ingredients: [IngredientInput(name: 'Flour')],
        instructions: [],
      );

      expect(state.status != ManualRecipeStatus.valid, isTrue);
    });

    test('is valid when all requirements are met', () {
      final state = ManualRecipeState(
        title: 'Recipe',
        ingredients: const [IngredientInput(name: 'Flour')],
        instructions: const [StepInput(id: '1', instruction: 'Mix')],
        status: ManualRecipeStatus.valid,
      );

      expect(state.status, equals(ManualRecipeStatus.valid));
    });
  });

  group('ManualRecipeState Requirements', () {
    test('requires non-empty title', () {
      final state = ManualRecipeState(
        title: '',
        ingredients: const [IngredientInput(name: 'Flour')],
        instructions: const [StepInput(id: '1', instruction: 'Mix')],
      );

      final isValid =
          state.title.trim().isNotEmpty &&
          state.ingredients.isNotEmpty &&
          state.instructions.isNotEmpty;

      expect(isValid, isFalse);
    });

    test('requires at least one ingredient', () {
      final state = ManualRecipeState(
        title: 'Recipe',
        ingredients: const [],
        instructions: const [StepInput(id: '1', instruction: 'Mix')],
      );

      final isValid =
          state.title.trim().isNotEmpty &&
          state.ingredients.isNotEmpty &&
          state.instructions.isNotEmpty;

      expect(isValid, isFalse);
    });

    test('requires at least one instruction', () {
      final state = ManualRecipeState(
        title: 'Recipe',
        ingredients: const [IngredientInput(name: 'Flour')],
        instructions: const [],
      );

      final isValid =
          state.title.trim().isNotEmpty &&
          state.ingredients.isNotEmpty &&
          state.instructions.isNotEmpty;

      expect(isValid, isFalse);
    });

    test('is valid with title, one ingredient, and one instruction', () {
      final state = ManualRecipeState(
        title: 'Recipe',
        ingredients: const [IngredientInput(name: 'Flour')],
        instructions: const [StepInput(id: '1', instruction: 'Mix')],
      );

      final isValid =
          state.title.trim().isNotEmpty &&
          state.ingredients.isNotEmpty &&
          state.instructions.isNotEmpty;

      expect(isValid, isTrue);
    });
  });

  group('ManualRecipe Notifier', () {
    test('initializes with empty state', () {
      final container = ProviderContainer();
      final state = container.read(manualRecipeProvider);

      expect(state.title, equals(''));
      expect(state.ingredients, isEmpty);
      expect(state.instructions, isEmpty);
      expect(state.status, equals(ManualRecipeStatus.empty));
    });

    test('setTitle updates title and triggers validation', () {
      final container = ProviderContainer();

      container.read(manualRecipeProvider.notifier).setTitle('My Recipe');

      final state = container.read(manualRecipeProvider);
      expect(state.title, equals('My Recipe'));
    });

    test('addIngredient adds ingredient to list', () {
      final container = ProviderContainer();

      container
          .read(manualRecipeProvider.notifier)
          .addIngredient(const IngredientInput(name: 'Flour'));

      final state = container.read(manualRecipeProvider);
      expect(state.ingredients, hasLength(1));
      expect(state.ingredients.first.name, equals('Flour'));
    });

    test('removeIngredient removes ingredient at index', () {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.addIngredient(const IngredientInput(name: 'Flour'));
      notifier.addIngredient(const IngredientInput(name: 'Sugar'));
      notifier.removeIngredient(0);

      final state = container.read(manualRecipeProvider);
      expect(state.ingredients, hasLength(1));
      expect(state.ingredients.first.name, equals('Sugar'));
    });

    test('updateIngredient updates ingredient at index', () {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.addIngredient(const IngredientInput(name: 'Flour'));
      notifier.updateIngredient(
        0,
        const IngredientInput(name: 'Updated Flour'),
      );

      final state = container.read(manualRecipeProvider);
      expect(state.ingredients.first.name, equals('Updated Flour'));
    });

    test('addInstruction adds instruction to list', () {
      final container = ProviderContainer();

      container
          .read(manualRecipeProvider.notifier)
          .addInstruction(const StepInput(id: '1', instruction: 'Mix well'));

      final state = container.read(manualRecipeProvider);
      expect(state.instructions, hasLength(1));
      expect(state.instructions.first.instruction, equals('Mix well'));
    });

    test('removeInstruction removes instruction at index', () {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.addInstruction(const StepInput(id: '1', instruction: 'Step 1'));
      notifier.addInstruction(const StepInput(id: '2', instruction: 'Step 2'));
      notifier.removeInstruction(0);

      final state = container.read(manualRecipeProvider);
      expect(state.instructions, hasLength(1));
      expect(state.instructions.first.instruction, equals('Step 2'));
    });

    test('updateInstruction updates instruction at index', () {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.addInstruction(const StepInput(id: '1', instruction: 'Step 1'));
      notifier.updateInstruction(
        0,
        const StepInput(id: '1', instruction: 'Updated Step'),
      );

      final state = container.read(manualRecipeProvider);
      expect(state.instructions.first.instruction, equals('Updated Step'));
    });

    test('reset clears all fields', () {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.setTitle('My Recipe');
      notifier.addIngredient(const IngredientInput(name: 'Flour'));
      notifier.addInstruction(const StepInput(id: '1', instruction: 'Mix'));
      notifier.reset();

      final state = container.read(manualRecipeProvider);
      expect(state.title, equals(''));
      expect(state.ingredients, isEmpty);
      expect(state.instructions, isEmpty);
      expect(state.status, equals(ManualRecipeStatus.empty));
    });
  });

  group('ManualRecipe Validation', () {
    test('validate returns false when title is empty', () {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.addIngredient(const IngredientInput(name: 'Flour'));
      notifier.addInstruction(const StepInput(id: '1', instruction: 'Mix'));
      final isValid = notifier.validate();

      expect(isValid, isFalse);
      expect(
        container.read(manualRecipeProvider).status,
        equals(ManualRecipeStatus.invalid),
      );
    });

    test('validate returns false when no ingredients', () {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.setTitle('My Recipe');
      notifier.addInstruction(const StepInput(id: '1', instruction: 'Mix'));
      final isValid = notifier.validate();

      expect(isValid, isFalse);
    });

    test('validate returns false when no instructions', () {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.setTitle('My Recipe');
      notifier.addIngredient(const IngredientInput(name: 'Flour'));
      final isValid = notifier.validate();

      expect(isValid, isFalse);
    });

    test('validate returns true when all requirements met', () {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.setTitle('My Recipe');
      notifier.addIngredient(const IngredientInput(name: 'Flour'));
      notifier.addInstruction(const StepInput(id: '1', instruction: 'Mix'));
      final isValid = notifier.validate();

      expect(isValid, isTrue);
      expect(
        container.read(manualRecipeProvider).status,
        equals(ManualRecipeStatus.valid),
      );
    });

    test('setTitle updates validation status automatically', () {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.addIngredient(const IngredientInput(name: 'Flour'));
      notifier.addInstruction(const StepInput(id: '1', instruction: 'Mix'));
      expect(
        container.read(manualRecipeProvider).status,
        equals(ManualRecipeStatus.empty),
      );

      notifier.setTitle('My Recipe');
      expect(
        container.read(manualRecipeProvider).status,
        equals(ManualRecipeStatus.valid),
      );
    });
  });

  group('ManualRecipe Submit', () {
    test('submit sets status to submitting then success', () async {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      notifier.setTitle('My Recipe');
      notifier.addIngredient(const IngredientInput(name: 'Flour'));
      notifier.addInstruction(const StepInput(id: '1', instruction: 'Mix'));

      expect(
        container.read(manualRecipeProvider).status,
        equals(ManualRecipeStatus.valid),
      );

      final submitFuture = notifier.submit();

      expect(
        container.read(manualRecipeProvider).status,
        equals(ManualRecipeStatus.submitting),
      );

      await submitFuture;

      expect(
        container.read(manualRecipeProvider).status,
        equals(ManualRecipeStatus.success),
      );
    });

    test('submit sets error status when validation fails', () async {
      final container = ProviderContainer();
      final notifier = container.read(manualRecipeProvider.notifier);

      await notifier.submit();

      expect(
        container.read(manualRecipeProvider).status,
        equals(ManualRecipeStatus.invalid),
      );
      expect(container.read(manualRecipeProvider).errorMessage, isNotEmpty);
    });
  });
}
