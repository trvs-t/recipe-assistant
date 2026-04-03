import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:app/presentation/providers/manual_recipe_provider.dart';
import 'package:app/presentation/widgets/instruction_input.dart';

void main() {
  group('InstructionInputRow Widget Tests', () {
    Widget buildTestWidget({
      required StepInput stepInput,
      required int index,
      void Function(StepInput)? onChanged,
      VoidCallback? onRemove,
    }) {
      return MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: InstructionInputRow(
              index: index,
              stepInput: stepInput,
              onChanged: onChanged ?? (_) {},
              onRemove: onRemove ?? () {},
            ),
          ),
        ),
      );
    }

    testWidgets('renders with empty state', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(id: '1', instruction: ''),
          index: 0,
        ),
      );

      // Should render a TextField and remove button
      expect(find.byType(TextField), findsOneWidget);
      expect(find.byIcon(Icons.remove_circle_outline), findsOneWidget);
    });

    testWidgets('renders with filled instruction data', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(
            id: '1',
            instruction: 'Preheat oven to 350°F',
            timerMinutes: 10,
          ),
          index: 0,
        ),
      );

      expect(find.text('Preheat oven to 350°F'), findsOneWidget);
    });

    testWidgets('renders correct step label', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(id: '1', instruction: ''),
          index: 0,
        ),
      );

      // Should show "Step 1" for index 0
      expect(find.text('Step 1'), findsOneWidget);
    });

    testWidgets('renders correct step label for different indices', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(id: '1', instruction: ''),
          index: 4,
        ),
      );

      expect(find.text('Step 5'), findsOneWidget); // index 4 + 1
    });

    testWidgets('calls onRemove when remove button is tapped', (tester) async {
      bool removeCalled = false;

      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(id: '1', instruction: 'Mix ingredients'),
          index: 0,
          onRemove: () => removeCalled = true,
        ),
      );

      await tester.tap(find.byIcon(Icons.remove_circle_outline));
      await tester.pump();

      expect(removeCalled, isTrue);
    });

    testWidgets('calls onChanged when instruction text is edited', (
      tester,
    ) async {
      StepInput? changedInstruction;

      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(id: '1', instruction: ''),
          index: 0,
          onChanged: (i) => changedInstruction = i,
        ),
      );

      await tester.enterText(find.byType(TextField), 'New instruction text');
      await tester.pump();

      expect(changedInstruction, isNotNull);
      expect(changedInstruction!.instruction, equals('New instruction text'));
    });

    testWidgets('remove button has correct tooltip', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(id: '1', instruction: 'Mix ingredients'),
          index: 0,
        ),
      );

      final iconButton = find.byType(IconButton);
      expect(iconButton, findsOneWidget);

      final iconButtonWidget = tester.widget<IconButton>(iconButton);
      expect(iconButtonWidget.tooltip, equals('Remove instruction'));
    });

    testWidgets('remove button uses error themed icon', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(id: '1', instruction: 'Mix ingredients'),
          index: 0,
        ),
      );

      // Verify the remove icon is displayed
      expect(find.byIcon(Icons.remove_circle_outline), findsOneWidget);
      // Verify it's in an IconButton
      expect(find.byType(IconButton), findsOneWidget);
    });

    testWidgets('text field has correct multiline configuration', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(id: '1', instruction: ''),
          index: 0,
        ),
      );

      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.maxLines, equals(3));
      expect(textField.minLines, equals(2));
      expect(textField.keyboardType, equals(TextInputType.multiline));
    });

    testWidgets('text field has correct hint text', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(id: '1', instruction: ''),
          index: 0,
        ),
      );

      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.decoration?.hintText, equals('Enter instruction...'));
    });

    testWidgets('text field aligns label with hint', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          stepInput: const StepInput(id: '1', instruction: ''),
          index: 0,
        ),
      );

      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.decoration?.alignLabelWithHint, isTrue);
    });

    testWidgets('controller is updated when stepInput changes externally', (
      tester,
    ) async {
      final stepInput1 = ValueNotifier<StepInput>(
        const StepInput(id: '1', instruction: 'Initial text'),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ValueListenableBuilder<StepInput>(
              valueListenable: stepInput1,
              builder: (context, stepInput, _) {
                return InstructionInputRow(
                  index: 0,
                  stepInput: stepInput,
                  onChanged: (_) {},
                  onRemove: () {},
                );
              },
            ),
          ),
        ),
      );

      expect(find.text('Initial text'), findsOneWidget);

      // Update the value
      stepInput1.value = const StepInput(id: '1', instruction: 'Updated text');

      await tester.pump();

      expect(find.text('Updated text'), findsOneWidget);
    });
  });

  group('InstructionListWidget Tests', () {
    late ProviderContainer container;

    tearDown(() {
      container.dispose();
    });

    Widget buildTestWidget({ManualRecipeState? initialState}) {
      container = ProviderContainer(
        overrides: [
          manualRecipeProvider.overrideWith(
            () => _TestManualRecipeNotifier(
              initialState ?? const ManualRecipeState(),
            ),
          ),
        ],
      );

      return UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: Scaffold(body: InstructionListWidget())),
      );
    }

    testWidgets('renders empty state with no instructions', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Add Instruction'), findsOneWidget);
      // No instruction rows should be present
      expect(find.byType(InstructionInputRow), findsNothing);
    });

    testWidgets('renders instruction rows when list is not empty', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            instructions: [
              StepInput(id: '1', instruction: 'Preheat oven'),
              StepInput(id: '2', instruction: 'Mix ingredients'),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(InstructionInputRow), findsNWidgets(2));
      expect(find.text('Preheat oven'), findsOneWidget);
      expect(find.text('Mix ingredients'), findsOneWidget);
    });

    testWidgets('renders correct number of instruction rows', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            instructions: [
              StepInput(id: '1', instruction: 'Step 1'),
              StepInput(id: '2', instruction: 'Step 2'),
              StepInput(id: '3', instruction: 'Step 3'),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(InstructionInputRow), findsNWidgets(3));
    });

    testWidgets('add button is enabled when under max', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            instructions: [StepInput(id: '1', instruction: 'Step 1')],
          ),
        ),
      );
      await tester.pumpAndSettle();

      final addButton = tester.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, 'Add Instruction'),
      );
      expect(addButton.onPressed, isNotNull);
    });

    testWidgets('instruction rows use correct ValueKeys', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            instructions: [
              StepInput(id: 'abc123', instruction: 'Step 1'),
              StepInput(id: 'def456', instruction: 'Step 2'),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('abc123')), findsOneWidget);
      expect(find.byKey(const ValueKey('def456')), findsOneWidget);
    });

    testWidgets('renders with single instruction', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            instructions: [StepInput(id: '1', instruction: 'Only step')],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(InstructionInputRow), findsOneWidget);
    });

    testWidgets('renders correct step numbers', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const ManualRecipeState(
            instructions: [
              StepInput(id: '1', instruction: 'First'),
              StepInput(id: '2', instruction: 'Second'),
              StepInput(id: '3', instruction: 'Third'),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Step 1'), findsOneWidget);
      expect(find.text('Step 2'), findsOneWidget);
      expect(find.text('Step 3'), findsOneWidget);
    });

    testWidgets('add button triggers provider addInstruction', (tester) async {
      final notifier = _TestManualRecipeNotifier(const ManualRecipeState());

      final container = ProviderContainer(
        overrides: [manualRecipeProvider.overrideWith(() => notifier)],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Scaffold(body: InstructionListWidget()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Add Instruction'));
      await tester.pump();

      expect(notifier.addInstructionCalled, isTrue);

      container.dispose();
    });

    testWidgets('remove button triggers provider removeInstruction', (
      tester,
    ) async {
      final notifier = _TestManualRecipeNotifier(
        const ManualRecipeState(
          instructions: [
            StepInput(id: '1', instruction: 'Step 1'),
            StepInput(id: '2', instruction: 'Step 2'),
          ],
        ),
      );

      final container = ProviderContainer(
        overrides: [manualRecipeProvider.overrideWith(() => notifier)],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Scaffold(body: InstructionListWidget()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Tap remove on first instruction
      final firstRow = find.byType(InstructionInputRow).first;
      await tester.tap(
        find.descendant(
          of: firstRow,
          matching: find.byIcon(Icons.remove_circle_outline),
        ),
      );
      await tester.pump();

      expect(notifier.removeInstructionIndex, equals(0));

      container.dispose();
    });

    testWidgets('instruction text change triggers provider updateInstruction', (
      tester,
    ) async {
      final notifier = _TestManualRecipeNotifier(
        const ManualRecipeState(
          instructions: [StepInput(id: '1', instruction: 'Original')],
        ),
      );

      final container = ProviderContainer(
        overrides: [manualRecipeProvider.overrideWith(() => notifier)],
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(
            home: Scaffold(body: InstructionListWidget()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Enter new text
      await tester.enterText(find.byType(TextField), 'Updated text');
      await tester.pump();

      expect(notifier.updateInstructionIndex, equals(0));
      expect(
        notifier.updateInstructionValue?.instruction,
        equals('Updated text'),
      );

      container.dispose();
    });
  });
}

/// Test notifier that properly overrides build() to return the desired state
class _TestManualRecipeNotifier extends ManualRecipe {
  _TestManualRecipeNotifier(this._initialState);

  final ManualRecipeState _initialState;

  bool addInstructionCalled = false;
  int? removeInstructionIndex;
  int? updateInstructionIndex;
  StepInput? updateInstructionValue;

  @override
  ManualRecipeState build() => _initialState;

  @override
  void addInstruction(StepInput instruction) {
    addInstructionCalled = true;
  }

  @override
  void removeInstruction(int index) {
    removeInstructionIndex = index;
  }

  @override
  void updateInstruction(int index, StepInput instruction) {
    updateInstructionIndex = index;
    updateInstructionValue = instruction;
  }

  @override
  void setTitle(String title) {
    // No-op
  }
}
