import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:app/data/models/ingredient_input.dart';
import 'package:app/presentation/providers/manual_recipe_provider.dart';
import 'package:app/presentation/widgets/manual_recipe_form.dart';

void main() {
  group('ManualRecipeForm Widget Tests', () {
    Widget buildTestWidget({ManualRecipeState? initialState}) {
      return ProviderScope(
        overrides: [
          manualRecipeProvider.overrideWith(
            () => _TestManualRecipeNotifier(
              initialState ?? const ManualRecipeState(),
            ),
          ),
        ],
        child: const MaterialApp(home: Scaffold(body: ManualRecipeForm())),
      );
    }

    testWidgets('renders correctly with empty state', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Title field should be present
      expect(find.byType(TextField), findsWidgets);
      expect(find.text('Recipe Title'), findsOneWidget);

      // Section headers should be present
      expect(find.text('Ingredients'), findsOneWidget);
      expect(find.text('Instructions'), findsOneWidget);

      // Empty state messages should be shown
      expect(find.text('No ingredients added yet'), findsOneWidget);
      expect(find.text('Tap + to add ingredients'), findsOneWidget);
      expect(find.text('No instructions added yet'), findsOneWidget);
      expect(find.text('Tap + to add steps'), findsOneWidget);

      // Submit button should be disabled (form is empty)
      expect(
        find.widgetWithText(ElevatedButton, 'Save Recipe'),
        findsOneWidget,
      );
    });

    testWidgets('renders title TextField with correct decoration', (
      tester,
    ) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final titleField = find.widgetWithText(TextField, 'Recipe Title');
      expect(titleField, findsOneWidget);

      final textField = tester.widget<TextField>(titleField);
      expect(textField.decoration?.hintText, 'Enter recipe name');
      expect(textField.decoration?.prefixIcon, isA<Icon>());
    });

    testWidgets('renders add buttons for ingredients and instructions', (
      tester,
    ) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Find add icon buttons (one for ingredients, one for instructions)
      expect(find.byIcon(Icons.add_circle_outline), findsNWidgets(2));
    });

    testWidgets('shows error text when title is empty and hasError is true', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            status: ManualRecipeStatus.invalid,
            errorMessage: 'Please enter a recipe title',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Please enter a recipe title'), findsAtLeastNWidgets(1));
    });

    testWidgets('shows error banner when errorMessage is present', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            status: ManualRecipeStatus.error,
            errorMessage: 'Something went wrong',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });

    testWidgets('shows success banner when status is success', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            status: ManualRecipeStatus.success,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Recipe saved successfully!'), findsOneWidget);
      expect(find.byIcon(Icons.check_circle), findsOneWidget);
    });

    testWidgets('shows loading state when status is submitting', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            status: ManualRecipeStatus.submitting,
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Saving recipe...'), findsOneWidget);
    });

    testWidgets('submit button is disabled when status is not valid', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            status: ManualRecipeStatus.empty,
          ),
        ),
      );
      await tester.pumpAndSettle();

      final submitButton = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'Save Recipe'),
      );
      expect(submitButton.onPressed, isNull);
    });

    testWidgets('submit button is enabled when status is valid', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: ManualRecipeState(
            title: 'My Recipe',
            ingredients: const [IngredientInput(name: 'Flour')],
            instructions: const [StepInput(id: '1', instruction: 'Mix')],
            status: ManualRecipeStatus.valid,
          ),
        ),
      );
      await tester.pumpAndSettle();

      final submitButton = tester.widget<ElevatedButton>(
        find.widgetWithText(ElevatedButton, 'Save Recipe'),
      );
      expect(submitButton.onPressed, isNotNull);
    });

    testWidgets('cancel button is present', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.widgetWithText(TextButton, 'Cancel'), findsOneWidget);
    });

    testWidgets('can enter text in title field', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final titleField = find.widgetWithText(TextField, 'Recipe Title');
      await tester.enterText(titleField, 'My Test Recipe');
      await tester.pump();

      final textField = tester.widget<TextField>(titleField);
      expect(textField.controller?.text, 'My Test Recipe');
    });

    testWidgets('displays ingredient list when ingredients are present', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: ManualRecipeState(
            ingredients: const [
              IngredientInput(name: 'Flour', quantity: 2, unit: 'cups'),
              IngredientInput(name: 'Sugar', quantity: 1, unit: 'cup'),
            ],
            status: ManualRecipeStatus.empty,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Should show ingredient cards instead of empty state
      expect(find.text('Flour'), findsOneWidget);
      expect(find.text('Sugar'), findsOneWidget);
      expect(find.text('No ingredients added yet'), findsNothing);
    });

    testWidgets('displays instruction list when instructions are present', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: ManualRecipeState(
            instructions: const [
              StepInput(id: '1', instruction: 'Preheat oven to 350°F'),
              StepInput(id: '2', instruction: 'Mix dry ingredients'),
            ],
            status: ManualRecipeStatus.empty,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Should show instruction cards instead of empty state
      expect(find.text('Preheat oven to 350°F'), findsOneWidget);
      expect(find.text('Mix dry ingredients'), findsOneWidget);
      expect(find.text('No instructions added yet'), findsNothing);
    });

    testWidgets('displays ingredient quantity and unit', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: ManualRecipeState(
            ingredients: const [
              IngredientInput(name: 'Flour', quantity: 2.5, unit: 'cups'),
            ],
            status: ManualRecipeStatus.empty,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('2.5 cups'), findsOneWidget);
    });

    testWidgets('displays instruction timer when present', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: ManualRecipeState(
            instructions: const [
              StepInput(
                id: '1',
                instruction: 'Bake for specified time',
                timerMinutes: 45,
              ),
            ],
            status: ManualRecipeStatus.empty,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Timer: 45 min'), findsOneWidget);
    });

    testWidgets('all inputs disabled when loading', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            status: ManualRecipeStatus.submitting,
          ),
        ),
      );
      await tester.pump();

      // Title field should be disabled
      final titleFields = tester.widgetList<TextField>(find.byType(TextField));
      for (final field in titleFields) {
        expect(field.enabled, isFalse);
      }
    });

    testWidgets('tapping add ingredient button opens dialog', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Find and tap the first add button (ingredients section)
      final addButtons = find.byIcon(Icons.add_circle_outline);
      await tester.tap(addButtons.first);
      await tester.pumpAndSettle();

      // Dialog should appear
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.text('Add Ingredient'), findsOneWidget);
    });

    testWidgets('tapping add instruction button opens dialog', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Find and tap the second add button (instructions section)
      final addButtons = find.byIcon(Icons.add_circle_outline);
      await tester.tap(addButtons.last);
      await tester.pumpAndSettle();

      // Dialog should appear
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.text('Add Instruction'), findsOneWidget);
    });
  });
}

/// Test notifier that properly overrides build() to return the desired state
class _TestManualRecipeNotifier extends ManualRecipe {
  _TestManualRecipeNotifier(this._initialState);

  final ManualRecipeState _initialState;

  @override
  ManualRecipeState build() => _initialState;

  @override
  void setTitle(String title) {
    // No-op for testing
  }

  @override
  void addIngredient(IngredientInput ingredient) {
    // No-op for testing
  }

  @override
  void removeIngredient(int index) {
    // No-op for testing
  }

  @override
  void addInstruction(StepInput instruction) {
    // No-op for testing
  }

  @override
  void removeInstruction(int index) {
    // No-op for testing
  }

  @override
  Future<void> submit() async {
    // No-op for testing
  }

  @override
  void reset() {
    // No-op for testing
  }
}
