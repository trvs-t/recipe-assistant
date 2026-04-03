import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:app/data/models/ingredient_input.dart';
import 'package:app/data/models/manual_recipe_input.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart';
import 'package:app/presentation/pages/add_recipe_page.dart';
import 'package:app/presentation/pages/recipe_list_page.dart';
import 'package:app/presentation/providers/manual_recipe_provider.dart';
import 'package:app/presentation/providers/providers.dart';

/// Mock implementation of IRecipeRepository for testing.
class MockRecipeRepository implements IRecipeRepository {
  final List<Recipe> _recipes = [];

  /// Configurable behavior for getRecipes.
  Future<List<Recipe>> Function()? getRecipesBehavior;

  /// Configurable behavior for createManualRecipe.
  Future<Recipe> Function(ManualRecipeInput input)? createManualRecipeBehavior;

  @override
  Future<List<Recipe>> getRecipes() async {
    if (getRecipesBehavior != null) {
      return getRecipesBehavior!();
    }
    return List.unmodifiable(_recipes);
  }

  @override
  Future<Recipe> getRecipe(String id) async {
    final recipe = _recipes.firstWhere(
      (r) => r.id == id,
      orElse: () => throw Exception('Recipe not found'),
    );
    return recipe;
  }

  @override
  Future<Recipe> createRecipe(String url) async {
    throw UnimplementedError();
  }

  @override
  Stream<Recipe> watchRecipe(String id) {
    throw UnimplementedError();
  }

  @override
  Future<void> deleteRecipe(String id) async {
    throw UnimplementedError();
  }

  @override
  Future<Recipe> createRecipeFromText(String text) async {
    throw UnimplementedError();
  }

  @override
  Future<Recipe> createManualRecipe(ManualRecipeInput input) async {
    if (createManualRecipeBehavior != null) {
      return createManualRecipeBehavior!(input);
    }
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

  /// Adds a recipe for testing.
  void addRecipeForTesting(Recipe recipe) {
    _recipes.add(recipe);
  }

  /// Clears all recipes.
  void clearRecipes() {
    _recipes.clear();
  }

  /// Returns the current recipes list.
  List<Recipe> get recipes => List.unmodifiable(_recipes);
}

/// Creates a test recipe.
Recipe createTestRecipe({
  String id = 'test-id',
  String title = 'Test Recipe',
  String? sourceUrl = 'https://example.com/recipe',
  RecipeStatus status = RecipeStatus.parsed,
}) {
  return Recipe(
    id: id,
    title: title,
    sourceUrl: sourceUrl,
    status: status,
    userId: 'test-user',
    createdAt: DateTime.now(),
    updatedAt: DateTime.now(),
  );
}

/// Creates test widget with providers and router.
Widget createTestWidget({
  Widget? child,
  required MockRecipeRepository mockRepository,
  GoRouter? router,
}) {
  return ProviderScope(
    overrides: [recipeRepositoryProvider.overrideWithValue(mockRepository)],
    child: router != null
        ? MaterialApp.router(routerConfig: router)
        : MaterialApp(home: child ?? const SizedBox()),
  );
}

/// Builds a router that starts at the add recipe page.
GoRouter buildAddRecipeRouter() {
  return GoRouter(
    initialLocation: '/add',
    routes: [
      GoRoute(path: '/', builder: (context, state) => const RecipeListPage()),
      GoRoute(path: '/add', builder: (context, state) => const AddRecipePage()),
      GoRoute(
        path: '/recipe/:id',
        builder: (context, state) {
          final id = state.pathParameters['id']!;
          return Scaffold(body: Text('Recipe Detail: $id'));
        },
      ),
    ],
  );
}

void main() {
  group('Manual Recipe Flow Integration Tests', () {
    late MockRecipeRepository mockRepository;

    setUp(() {
      mockRepository = MockRecipeRepository();
    });

    group('Happy Path - Complete Manual Recipe Flow', () {
      testWidgets(
        'complete flow: open page, switch to manual, fill form, submit, navigate to list',
        (WidgetTester tester) async {
          // Arrange
          mockRepository.createManualRecipeBehavior = (input) async {
            return Recipe(
              id: 'new-recipe-id',
              title: input.title,
              status: RecipeStatus.draft,
              userId: 'test-user',
              createdAt: DateTime.now(),
              updatedAt: DateTime.now(),
            );
          };

          await tester.pumpWidget(
            createTestWidget(
              mockRepository: mockRepository,
              router: buildAddRecipeRouter(),
            ),
          );
          await tester.pumpAndSettle();

          // Should start on Add Recipe page
          expect(find.text('Add Recipe'), findsOneWidget);

          // Act: Switch to Manual Entry mode
          await tester.tap(find.text('Manual Entry'));
          await tester.pumpAndSettle();

          // Should show ManualRecipeForm
          expect(find.text('Recipe Title'), findsOneWidget);
          expect(find.text('Ingredients'), findsOneWidget);
          expect(find.text('Instructions'), findsOneWidget);

          // Act: Fill in title
          await tester.enterText(
            find.widgetWithText(TextField, 'Recipe Title'),
            'My Test Recipe',
          );
          await tester.pumpAndSettle();

          // Act: Add ingredient (tap add button)
          await tester.tap(find.byIcon(Icons.add_circle_outline).first);
          await tester.pumpAndSettle();

          // Should show Add Ingredient dialog
          expect(find.text('Add Ingredient'), findsOneWidget);

          // Fill ingredient details
          await tester.enterText(
            find.widgetWithText(TextField, 'Ingredient Name *'),
            'Flour',
          );
          await tester.enterText(
            find.widgetWithText(TextField, 'Quantity'),
            '2',
          );
          await tester.enterText(
            find.widgetWithText(TextField, 'Unit'),
            'cups',
          );

          // Confirm add ingredient
          await tester.tap(find.text('Add'));
          await tester.pumpAndSettle();

          // Should show ingredient in list
          expect(find.text('Flour'), findsOneWidget);
          // Check for quantity - the format is "quantity unit"
          expect(find.textContaining('2'), findsOneWidget);
          expect(find.textContaining('cups'), findsOneWidget);

          // Act: Add instruction (tap add button)
          await tester.tap(find.byIcon(Icons.add_circle_outline).last);
          await tester.pumpAndSettle();

          // Should show Add Instruction dialog
          expect(find.text('Add Instruction'), findsOneWidget);

          // Fill instruction details
          await tester.enterText(
            find.widgetWithText(TextField, 'Instruction *'),
            'Preheat oven to 350°F',
          );
          await tester.enterText(
            find.widgetWithText(TextField, 'Timer (minutes)'),
            '45',
          );

          // Confirm add instruction
          await tester.tap(find.text('Add'));
          await tester.pumpAndSettle();

          // Should show instruction in list
          expect(find.text('Preheat oven to 350°F'), findsOneWidget);
          expect(find.text('Timer: 45 min'), findsOneWidget);

          // Act: Submit form (Save Recipe button should now be enabled)
          final submitButton = find.widgetWithText(
            ElevatedButton,
            'Save Recipe',
          );
          expect(
            tester.widget<ElevatedButton>(submitButton).onPressed,
            isNotNull,
          );

          await tester.tap(submitButton);

          // Wait for submission to complete
          await tester.pumpAndSettle();

          // After success, should navigate to recipe detail
          expect(find.textContaining('Recipe Detail:'), findsOneWidget);
        },
      );

      testWidgets('recipe appears in list after successful submission', (
        WidgetTester tester,
      ) async {
        // Arrange - track created recipes
        final createdRecipes = <Recipe>[];

        mockRepository.createManualRecipeBehavior = (input) async {
          final recipe = Recipe(
            id: 'my-new-recipe',
            title: input.title,
            status: RecipeStatus.draft,
            userId: 'test-user',
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );
          createdRecipes.add(recipe);
          return recipe;
        };

        // getRecipes should return our created recipes
        mockRepository.getRecipesBehavior = () async {
          return List.unmodifiable(createdRecipes);
        };

        // Set up router that can navigate between list and add
        final router = GoRouter(
          initialLocation: '/',
          routes: [
            GoRoute(
              path: '/',
              builder: (context, state) => const RecipeListPage(),
            ),
            GoRoute(
              path: '/add',
              builder: (context, state) => const AddRecipePage(),
            ),
            GoRoute(
              path: '/recipe/:id',
              builder: (context, state) {
                final id = state.pathParameters['id']!;
                return Scaffold(
                  appBar: AppBar(title: Text('Recipe $id')),
                  body: Text('Recipe Detail: $id'),
                );
              },
            ),
          ],
        );

        await tester.pumpWidget(
          createTestWidget(mockRepository: mockRepository, router: router),
        );
        await tester.pumpAndSettle();

        // Navigate to Add Recipe via FAB
        await tester.tap(find.byType(FloatingActionButton));
        await tester.pumpAndSettle();

        expect(find.text('Add Recipe'), findsOneWidget);

        // Switch to manual mode
        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Fill in recipe details
        await tester.enterText(
          find.widgetWithText(TextField, 'Recipe Title'),
          'Chocolate Cake',
        );
        await tester.pumpAndSettle();

        // Add ingredient
        final addButtons = find.byIcon(Icons.add_circle_outline);
        await tester.tap(addButtons.first);
        await tester.pumpAndSettle();

        await tester.enterText(
          find.widgetWithText(TextField, 'Ingredient Name *'),
          'Chocolate',
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();

        // Add instruction
        final addButtonsAfter = find.byIcon(Icons.add_circle_outline);
        await tester.tap(addButtonsAfter.last);
        await tester.pumpAndSettle();

        await tester.enterText(
          find.widgetWithText(TextField, 'Instruction *'),
          'Mix ingredients',
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();

        // Submit
        await tester.tap(find.widgetWithText(ElevatedButton, 'Save Recipe'));
        await tester.pumpAndSettle();

        // After success, should navigate to recipe detail
        expect(
          find.textContaining('Recipe Detail: my-new-recipe'),
          findsOneWidget,
        );

        // Navigate back to home using go
        router.go('/');
        await tester.pumpAndSettle();

        // Verify recipe appears in list
        expect(find.text('Chocolate Cake'), findsOneWidget);
      });
    });

    group('Validation Error Tests', () {
      testWidgets('shows error when submitting with empty title', (
        WidgetTester tester,
      ) async {
        await tester.pumpWidget(
          createTestWidget(
            mockRepository: mockRepository,
            router: buildAddRecipeRouter(),
          ),
        );
        await tester.pumpAndSettle();

        // Switch to manual mode
        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Add ingredient and instruction so form is partially valid
        await tester.tap(find.byIcon(Icons.add_circle_outline).first);
        await tester.pumpAndSettle();

        await tester.enterText(
          find.widgetWithText(TextField, 'Ingredient Name *'),
          'Flour',
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();

        await tester.tap(find.byIcon(Icons.add_circle_outline).last);
        await tester.pumpAndSettle();

        await tester.enterText(
          find.widgetWithText(TextField, 'Instruction *'),
          'Mix',
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();

        // Try to submit with empty title
        final submitButton = find.widgetWithText(ElevatedButton, 'Save Recipe');

        // Button should be disabled because title is empty
        expect(tester.widget<ElevatedButton>(submitButton).onPressed, isNull);
      });

      testWidgets('shows error when submitting with no ingredients', (
        WidgetTester tester,
      ) async {
        await tester.pumpWidget(
          createTestWidget(
            mockRepository: mockRepository,
            router: buildAddRecipeRouter(),
          ),
        );
        await tester.pumpAndSettle();

        // Switch to manual mode
        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Fill title but don't add ingredients
        await tester.enterText(
          find.widgetWithText(TextField, 'Recipe Title'),
          'My Recipe',
        );
        await tester.pumpAndSettle();

        // Add instruction but no ingredient
        await tester.tap(find.byIcon(Icons.add_circle_outline).last);
        await tester.pumpAndSettle();

        await tester.enterText(
          find.widgetWithText(TextField, 'Instruction *'),
          'Mix well',
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();

        // Submit button should be disabled (no ingredients)
        final submitButton = find.widgetWithText(ElevatedButton, 'Save Recipe');
        expect(tester.widget<ElevatedButton>(submitButton).onPressed, isNull);
      });

      testWidgets('shows error when submitting with no instructions', (
        WidgetTester tester,
      ) async {
        await tester.pumpWidget(
          createTestWidget(
            mockRepository: mockRepository,
            router: buildAddRecipeRouter(),
          ),
        );
        await tester.pumpAndSettle();

        // Switch to manual mode
        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Fill title and add ingredient but no instructions
        await tester.enterText(
          find.widgetWithText(TextField, 'Recipe Title'),
          'My Recipe',
        );
        await tester.pumpAndSettle();

        await tester.tap(find.byIcon(Icons.add_circle_outline).first);
        await tester.pumpAndSettle();

        await tester.enterText(
          find.widgetWithText(TextField, 'Ingredient Name *'),
          'Sugar',
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();

        // Submit button should be disabled (no instructions)
        final submitButton = find.widgetWithText(ElevatedButton, 'Save Recipe');
        expect(tester.widget<ElevatedButton>(submitButton).onPressed, isNull);
      });

      testWidgets('shows error banner when manual form validation fails', (
        WidgetTester tester,
      ) async {
        await tester.pumpWidget(
          createTestWidget(
            mockRepository: mockRepository,
            router: buildAddRecipeRouter(),
          ),
        );
        await tester.pumpAndSettle();

        // Switch to manual mode
        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Don't fill anything and try to submit (button won't be enabled
        // but we can verify the empty state)

        // Empty state messages should be shown
        expect(find.text('No ingredients added yet'), findsOneWidget);
        expect(find.text('No instructions added yet'), findsOneWidget);
      });

      testWidgets('shows specific error when title is empty on invalid state', (
        WidgetTester tester,
      ) async {
        // Create a custom provider override to force invalid state
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              manualRecipeProvider.overrideWith(
                () => _TestManualRecipeNotifier(
                  const ManualRecipeState(
                    title: '',
                    ingredients: [
                      IngredientInput(name: 'Flour', quantity: 1, unit: 'cup'),
                    ],
                    instructions: [StepInput(id: '1', instruction: 'Mix')],
                    status: ManualRecipeStatus.invalid,
                    errorMessage: 'Please enter a recipe title',
                  ),
                ),
              ),
            ],
            child: MaterialApp.router(routerConfig: buildAddRecipeRouter()),
          ),
        );
        await tester.pumpAndSettle();

        // Switch to manual mode
        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Should show error message (may appear multiple times due to form structure)
        expect(
          find.text('Please enter a recipe title'),
          findsAtLeastNWidgets(1),
        );
      });

      testWidgets('shows error when no ingredients added', (
        WidgetTester tester,
      ) async {
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              manualRecipeProvider.overrideWith(
                () => _TestManualRecipeNotifier(
                  const ManualRecipeState(
                    title: 'My Recipe',
                    ingredients: [],
                    instructions: [StepInput(id: '1', instruction: 'Mix')],
                    status: ManualRecipeStatus.invalid,
                    errorMessage: 'Please add at least one ingredient',
                  ),
                ),
              ),
            ],
            child: MaterialApp.router(routerConfig: buildAddRecipeRouter()),
          ),
        );
        await tester.pumpAndSettle();

        // Switch to manual mode
        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Should show error message
        expect(
          find.text('Please add at least one ingredient'),
          findsAtLeastNWidgets(1),
        );
      });

      testWidgets('shows error when no instructions added', (
        WidgetTester tester,
      ) async {
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              manualRecipeProvider.overrideWith(
                () => _TestManualRecipeNotifier(
                  const ManualRecipeState(
                    title: 'My Recipe',
                    ingredients: [
                      IngredientInput(name: 'Flour', quantity: 1, unit: 'cup'),
                    ],
                    instructions: [],
                    status: ManualRecipeStatus.invalid,
                    errorMessage: 'Please add at least one instruction',
                  ),
                ),
              ),
            ],
            child: MaterialApp.router(routerConfig: buildAddRecipeRouter()),
          ),
        );
        await tester.pumpAndSettle();

        // Switch to manual mode
        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Should show error message
        expect(
          find.text('Please add at least one instruction'),
          findsAtLeastNWidgets(1),
        );
      });
    });

    group('Navigation Tests', () {
      testWidgets('can switch between input modes', (
        WidgetTester tester,
      ) async {
        await tester.pumpWidget(
          createTestWidget(
            mockRepository: mockRepository,
            router: buildAddRecipeRouter(),
          ),
        );
        await tester.pumpAndSettle();

        // Should start with URL input
        expect(find.text('Recipe URL'), findsOneWidget);
        expect(find.text('From URL'), findsOneWidget);

        // Switch to Text mode
        await tester.tap(find.text('From Text'));
        await tester.pumpAndSettle();

        expect(find.text('Recipe Text'), findsOneWidget);
        expect(find.text('Paste your recipe here...'), findsOneWidget);

        // Switch to Manual mode
        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        expect(find.text('Recipe Title'), findsOneWidget);
        expect(find.text('Ingredients'), findsOneWidget);

        // Switch back to URL mode
        await tester.tap(find.text('From URL'));
        await tester.pumpAndSettle();

        expect(find.text('Recipe URL'), findsOneWidget);
      });
    });

    group('Form Interaction Tests', () {
      testWidgets('can add multiple ingredients', (WidgetTester tester) async {
        await tester.pumpWidget(
          createTestWidget(
            mockRepository: mockRepository,
            router: buildAddRecipeRouter(),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Add first ingredient
        await tester.tap(find.byIcon(Icons.add_circle_outline).first);
        await tester.pumpAndSettle();

        await tester.enterText(
          find.widgetWithText(TextField, 'Ingredient Name *'),
          'Flour',
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();

        // Add second ingredient
        await tester.tap(find.byIcon(Icons.add_circle_outline).first);
        await tester.pumpAndSettle();

        await tester.enterText(
          find.widgetWithText(TextField, 'Ingredient Name *'),
          'Sugar',
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();

        // Both ingredients should be visible
        expect(find.text('Flour'), findsOneWidget);
        expect(find.text('Sugar'), findsOneWidget);
      });

      testWidgets('can remove ingredients', (WidgetTester tester) async {
        await tester.pumpWidget(
          createTestWidget(
            mockRepository: mockRepository,
            router: buildAddRecipeRouter(),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Add ingredient
        await tester.tap(find.byIcon(Icons.add_circle_outline).first);
        await tester.pumpAndSettle();

        await tester.enterText(
          find.widgetWithText(TextField, 'Ingredient Name *'),
          'Flour',
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();

        expect(find.text('Flour'), findsOneWidget);

        // Remove ingredient
        await tester.tap(find.byIcon(Icons.delete_outline));
        await tester.pumpAndSettle();

        expect(find.text('Flour'), findsNothing);
        expect(find.text('No ingredients added yet'), findsOneWidget);
      });

      testWidgets('cancel button resets the form', (WidgetTester tester) async {
        await tester.pumpWidget(
          createTestWidget(
            mockRepository: mockRepository,
            router: buildAddRecipeRouter(),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Manual Entry'));
        await tester.pumpAndSettle();

        // Fill in some data
        await tester.enterText(
          find.widgetWithText(TextField, 'Recipe Title'),
          'My Recipe',
        );
        await tester.pumpAndSettle();

        await tester.tap(find.byIcon(Icons.add_circle_outline).first);
        await tester.pumpAndSettle();

        await tester.enterText(
          find.widgetWithText(TextField, 'Ingredient Name *'),
          'Flour',
        );
        await tester.tap(find.text('Add'));
        await tester.pumpAndSettle();

        expect(find.text('My Recipe'), findsOneWidget);
        expect(find.text('Flour'), findsOneWidget);

        // Scroll down to find Cancel button - use the ManualRecipeForm's scroll view
        final scrollViews = find.byType(SingleChildScrollView);
        // The form's scroll view is inside ManualRecipeForm
        await tester.drag(scrollViews.last, const Offset(0, -300));
        await tester.pumpAndSettle();

        // Tap cancel
        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();

        // Form should be reset
        expect(find.text('No ingredients added yet'), findsOneWidget);
      });
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
