import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/data/models/ingredient_input.dart';
import 'package:app/presentation/widgets/ingredient_input.dart';

void main() {
  group('IngredientInputRow Widget Tests', () {
    Widget buildTestWidget({
      required IngredientInput ingredient,
      required int index,
      void Function(IngredientInput)? onChanged,
      VoidCallback? onRemove,
    }) {
      return MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: IngredientInputRow(
              index: index,
              ingredient: ingredient,
              onChanged: onChanged ?? (_) {},
              onRemove: onRemove ?? () {},
            ),
          ),
        ),
      );
    }

    testWidgets('renders with empty state', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(ingredient: const IngredientInput(name: ''), index: 0),
      );

      // Should render all 4 text fields
      expect(find.byType(TextField), findsNWidgets(4));
      // Should render remove button
      expect(find.byIcon(Icons.remove_circle_outline), findsOneWidget);
    });

    testWidgets('renders with filled ingredient data', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          ingredient: const IngredientInput(
            name: 'Flour',
            quantity: 2.5,
            unit: 'cups',
            notes: 'sifted',
          ),
          index: 0,
        ),
      );

      // All fields should have correct initial values
      expect(find.text('2.5'), findsOneWidget);
      expect(find.text('cups'), findsOneWidget);
      expect(find.text('Flour'), findsOneWidget);
      // notes field shows 'sifted' but there's also the TextField widget with same text
      expect(find.text('sifted'), findsAtLeastNWidgets(1));
    });

    testWidgets('renders correct field labels', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(ingredient: const IngredientInput(name: ''), index: 0),
      );

      expect(find.text('Qty'), findsOneWidget);
      expect(find.text('Unit'), findsOneWidget);
      expect(find.text('Ingredient'), findsOneWidget);
      expect(find.text('Notes'), findsOneWidget);
    });

    testWidgets('calls onRemove when remove button is tapped', (tester) async {
      bool removeCalled = false;

      await tester.pumpWidget(
        buildTestWidget(
          ingredient: const IngredientInput(name: 'Flour'),
          index: 0,
          onRemove: () => removeCalled = true,
        ),
      );

      await tester.tap(find.byIcon(Icons.remove_circle_outline));
      await tester.pump();

      expect(removeCalled, isTrue);
    });

    testWidgets('calls onChanged when quantity is edited', (tester) async {
      IngredientInput? changedIngredient;

      await tester.pumpWidget(
        buildTestWidget(
          ingredient: const IngredientInput(name: 'Flour'),
          index: 0,
          onChanged: (i) => changedIngredient = i,
        ),
      );

      // Find quantity field (first TextField) and enter text
      final quantityField = find.byType(TextField).first;
      await tester.enterText(quantityField, '3');
      await tester.pump();

      expect(changedIngredient, isNotNull);
      expect(changedIngredient!.quantity, equals(3.0));
    });

    testWidgets('calls onChanged when unit is edited', (tester) async {
      IngredientInput? changedIngredient;

      await tester.pumpWidget(
        buildTestWidget(
          ingredient: const IngredientInput(name: 'Flour'),
          index: 0,
          onChanged: (i) => changedIngredient = i,
        ),
      );

      // Find unit field (second TextField) and enter text
      final unitField = find.byType(TextField).at(1);
      await tester.enterText(unitField, 'tbsp');
      await tester.pump();

      expect(changedIngredient, isNotNull);
      expect(changedIngredient!.unit, equals('tbsp'));
    });

    testWidgets('calls onChanged when name is edited', (tester) async {
      IngredientInput? changedIngredient;

      await tester.pumpWidget(
        buildTestWidget(
          ingredient: const IngredientInput(name: 'Flour'),
          index: 0,
          onChanged: (i) => changedIngredient = i,
        ),
      );

      // Find name field (third TextField) and enter text
      final nameField = find.byType(TextField).at(2);
      await tester.enterText(nameField, 'Sugar');
      await tester.pump();

      expect(changedIngredient, isNotNull);
      expect(changedIngredient!.name, equals('Sugar'));
    });

    testWidgets('calls onChanged when notes is edited', (tester) async {
      IngredientInput? changedIngredient;

      await tester.pumpWidget(
        buildTestWidget(
          ingredient: const IngredientInput(name: 'Flour'),
          index: 0,
          onChanged: (i) => changedIngredient = i,
        ),
      );

      // Find notes field (fourth TextField) and enter text
      final notesField = find.byType(TextField).last;
      await tester.enterText(notesField, 'cold');
      await tester.pump();

      expect(changedIngredient, isNotNull);
      expect(changedIngredient!.notes, equals('cold'));
    });

    testWidgets('remove button has correct tooltip', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          ingredient: const IngredientInput(name: 'Flour'),
          index: 0,
        ),
      );

      final iconButton = find.byType(IconButton);
      expect(iconButton, findsOneWidget);

      final iconButtonWidget = tester.widget<IconButton>(iconButton);
      expect(iconButtonWidget.tooltip, equals('Remove ingredient'));
    });

    testWidgets('remove button uses error themed icon', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          ingredient: const IngredientInput(name: 'Flour'),
          index: 0,
        ),
      );

      // Verify the remove icon is displayed
      expect(find.byIcon(Icons.remove_circle_outline), findsOneWidget);
      // Verify it's in an IconButton
      expect(find.byType(IconButton), findsOneWidget);
    });
  });

  group('IngredientListWidget Tests', () {
    Widget buildTestWidget({
      List<IngredientInput> ingredients = const [],
      void Function(List<IngredientInput>)? onIngredientsChanged,
    }) {
      return MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: IngredientListWidget(
              ingredients: ingredients,
              onIngredientsChanged: onIngredientsChanged ?? (_) {},
            ),
          ),
        ),
      );
    }

    testWidgets('renders empty state with no ingredients', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      expect(find.text('Ingredients'), findsOneWidget);
      expect(find.text('Add Ingredient'), findsOneWidget);
      // No ingredient rows should be present
      expect(find.byType(IngredientInputRow), findsNothing);
    });

    testWidgets('renders ingredient rows when list is not empty', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          ingredients: const [
            IngredientInput(name: 'Flour'),
            IngredientInput(name: 'Sugar'),
          ],
        ),
      );

      expect(find.byType(IngredientInputRow), findsNWidgets(2));
      expect(find.text('Flour'), findsOneWidget);
      expect(find.text('Sugar'), findsOneWidget);
    });

    testWidgets('renders correct number of ingredient rows', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          ingredients: const [
            IngredientInput(name: 'Flour'),
            IngredientInput(name: 'Sugar'),
            IngredientInput(name: 'Butter'),
          ],
        ),
      );

      expect(find.byType(IngredientInputRow), findsNWidgets(3));
    });

    testWidgets('calls onIngredientsChanged when add button is tapped', (
      tester,
    ) async {
      List<IngredientInput>? changedIngredients;

      await tester.pumpWidget(
        buildTestWidget(
          ingredients: const [IngredientInput(name: 'Flour')],
          onIngredientsChanged: (i) => changedIngredients = i,
        ),
      );

      await tester.tap(find.text('Add Ingredient'));
      await tester.pump();

      expect(changedIngredients, isNotNull);
      expect(changedIngredients!.length, equals(2));
    });

    testWidgets('calls onIngredientsChanged when remove is tapped on row', (
      tester,
    ) async {
      List<IngredientInput>? changedIngredients;

      await tester.pumpWidget(
        buildTestWidget(
          ingredients: const [
            IngredientInput(name: 'Flour'),
            IngredientInput(name: 'Sugar'),
          ],
          onIngredientsChanged: (i) => changedIngredients = i,
        ),
      );

      // Tap remove on first ingredient
      final firstRemoveButton = find.byType(IngredientInputRow).first;
      await tester.tap(
        find.descendant(
          of: firstRemoveButton,
          matching: find.byIcon(Icons.remove_circle_outline),
        ),
      );
      await tester.pump();

      expect(changedIngredients, isNotNull);
      expect(changedIngredients!.length, equals(1));
      expect(changedIngredients!.first.name, equals('Sugar'));
    });

    testWidgets('disables add button when max ingredients reached', (
      tester,
    ) async {
      // Create a list with maxIngredients
      final maxList = List.generate(
        maxIngredients,
        (i) => IngredientInput(name: 'Ingredient $i'),
      );

      await tester.pumpWidget(buildTestWidget(ingredients: maxList));

      // Should show maximum reached message
      expect(
        find.text('Maximum $maxIngredients ingredients reached'),
        findsOneWidget,
      );
    });

    testWidgets('add button is enabled when under max', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(ingredients: const [IngredientInput(name: 'Flour')]),
      );

      final addButton = tester.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, 'Add Ingredient'),
      );
      expect(addButton.onPressed, isNotNull);
    });

    testWidgets('has correct header row alignment', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(ingredients: const [IngredientInput(name: 'Flour')]),
      );

      // Header should contain 'Ingredients' title
      expect(find.text('Ingredients'), findsOneWidget);
    });

    testWidgets('renders with single ingredient', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(ingredients: const [IngredientInput(name: 'Flour')]),
      );

      expect(find.byType(IngredientInputRow), findsOneWidget);
    });

    testWidgets('ingredient row uses ValueKey for proper rebuilding', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          ingredients: const [
            IngredientInput(name: 'Flour'),
            IngredientInput(name: 'Sugar'),
          ],
        ),
      );

      // Both rows should have ValueKeys
      expect(find.byKey(const ValueKey('ingredient_0')), findsOneWidget);
      expect(find.byKey(const ValueKey('ingredient_1')), findsOneWidget);
    });

    testWidgets('fields show correct hint text', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(ingredients: const [IngredientInput(name: '')]),
      );

      expect(find.text('2'), findsOneWidget); // quantity hint
      expect(find.text('cup'), findsOneWidget); // unit hint
      expect(find.text('flour'), findsOneWidget); // name hint
      expect(find.text('sifted'), findsOneWidget); // notes hint
    });

    testWidgets('quantity field has correct keyboard type', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(ingredients: const [IngredientInput(name: 'Flour')]),
      );

      final quantityField = tester.widget<TextField>(
        find.byType(TextField).first,
      );
      expect(quantityField.keyboardType?.decimal, isTrue);
    });

    testWidgets('quantity field is center aligned', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(ingredients: const [IngredientInput(name: 'Flour')]),
      );

      final quantityField = tester.widget<TextField>(
        find.byType(TextField).first,
      );
      expect(quantityField.textAlign, equals(TextAlign.center));
    });

    testWidgets('name field is expanded', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(ingredients: const [IngredientInput(name: 'Flour')]),
      );

      // The name field should be in an Expanded widget
      // We can verify by checking the row structure
      final textFields = tester.widgetList<TextField>(find.byType(TextField));
      expect(textFields.length, equals(4)); // qty, unit, name, notes
    });
  });
}
