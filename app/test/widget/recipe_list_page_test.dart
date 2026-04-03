import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:app/data/models/manual_recipe_input.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart';
import 'package:app/presentation/pages/recipe_list_page.dart';
import 'package:app/presentation/providers/providers.dart';

/// Mock implementation of IRecipeRepository for testing.
class MockRecipeRepository implements IRecipeRepository {
  final List<Recipe> _recipes = [];

  /// Configurable behavior for getRecipes.
  Future<List<Recipe>> Function()? getRecipesBehavior;

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

  /// Adds a recipe for testing.
  void addRecipeForTesting(Recipe recipe) {
    _recipes.add(recipe);
  }

  /// Clears all recipes.
  void clearRecipes() {
    _recipes.clear();
  }
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

/// Creates a test widget with providers and router.
Widget createTestWidget({
  required Widget child,
  required MockRecipeRepository mockRepository,
  GoRouter? router,
}) {
  return ProviderScope(
    overrides: [recipeRepositoryProvider.overrideWithValue(mockRepository)],
    child: router != null
        ? ProviderScope(child: MaterialApp.router(routerConfig: router))
        : ProviderScope(child: MaterialApp(home: child)),
  );
}

void main() {
  group('RecipeListPage', () {
    late MockRecipeRepository mockRepository;

    setUp(() {
      mockRepository = MockRecipeRepository();
    });

    testWidgets('renders AppBar with title "My Recipes"', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(
        createTestWidget(
          child: const RecipeListPage(),
          mockRepository: mockRepository,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(AppBar), findsOneWidget);
      expect(find.text('My Recipes'), findsOneWidget);
    });

    testWidgets('shows FAB that navigates to /add', (
      WidgetTester tester,
    ) async {
      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => const RecipeListPage(),
          ),
          GoRoute(
            path: '/add',
            builder: (context, state) =>
                const Scaffold(body: Text('Add Recipe Page')),
          ),
        ],
      );

      await tester.pumpWidget(
        createTestWidget(
          child: const RecipeListPage(),
          mockRepository: mockRepository,
          router: router,
        ),
      );
      await tester.pumpAndSettle();

      // Find FAB
      final fab = find.byType(FloatingActionButton);
      expect(fab, findsOneWidget);

      // Tap FAB
      await tester.tap(fab);
      await tester.pumpAndSettle();

      // Verify navigation to /add
      expect(find.text('Add Recipe Page'), findsOneWidget);
    });

    testWidgets('shows loading indicator while fetching', (
      WidgetTester tester,
    ) async {
      final completer = Completer<List<Recipe>>();
      mockRepository.getRecipesBehavior = () => completer.future;

      await tester.pumpWidget(
        createTestWidget(
          child: const RecipeListPage(),
          mockRepository: mockRepository,
        ),
      );

      // Should show loading indicator
      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      // Complete the future
      completer.complete([]);
      await tester.pumpAndSettle();
    });

    testWidgets('shows empty state when no recipes', (
      WidgetTester tester,
    ) async {
      mockRepository.getRecipesBehavior = () async => [];

      await tester.pumpWidget(
        createTestWidget(
          child: const RecipeListPage(),
          mockRepository: mockRepository,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('No recipes yet'), findsOneWidget);
      expect(
        find.text('Add your first recipe by tapping the + button'),
        findsOneWidget,
      );
      expect(find.byIcon(Icons.restaurant_menu), findsOneWidget);
    });

    testWidgets('shows recipe cards when recipes exist', (
      WidgetTester tester,
    ) async {
      mockRepository.addRecipeForTesting(
        createTestRecipe(
          id: '1',
          title: 'Test Recipe 1',
          sourceUrl: 'https://example.com/recipe1',
        ),
      );
      mockRepository.addRecipeForTesting(
        createTestRecipe(
          id: '2',
          title: 'Test Recipe 2',
          sourceUrl: 'https://example.com/recipe2',
        ),
      );

      await tester.pumpWidget(
        createTestWidget(
          child: const RecipeListPage(),
          mockRepository: mockRepository,
        ),
      );
      await tester.pumpAndSettle();

      // Should show recipe cards
      expect(find.byType(RecipeCard), findsNWidgets(2));
      expect(find.text('Test Recipe 1'), findsOneWidget);
      expect(find.text('Test Recipe 2'), findsOneWidget);
    });

    testWidgets('shows error state with retry button', (
      WidgetTester tester,
    ) async {
      mockRepository.getRecipesBehavior = () async =>
          throw Exception('Test error');

      await tester.pumpWidget(
        createTestWidget(
          child: const RecipeListPage(),
          mockRepository: mockRepository,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Failed to load recipes'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);

      final retryButton = find.widgetWithText(ElevatedButton, 'Retry');
      expect(retryButton, findsOneWidget);
    });
    testWidgets('retry button refreshes recipes', (WidgetTester tester) async {
      // Start with an error by using a behavior that throws
      mockRepository.getRecipesBehavior = () async {
        throw Exception('Test error');
      };

      await tester.pumpWidget(
        createTestWidget(
          child: const RecipeListPage(),
          mockRepository: mockRepository,
        ),
      );
      // Wait for the async error to settle
      await tester.pumpAndSettle();

      expect(find.text('Something went wrong'), findsOneWidget);

      // Change behavior to succeed on next call
      mockRepository.getRecipesBehavior = () async => [
        createTestRecipe(id: '2'),
      ];

      // Tap retry button
      await tester.tap(find.widgetWithText(ElevatedButton, 'Retry'));
      await tester.pumpAndSettle();

      // Should now show the recipe card (retry succeeded)
      expect(find.byType(RecipeCard), findsOneWidget);
    });
    testWidgets('pull-to-refresh reloads recipes', (WidgetTester tester) async {
      mockRepository.addRecipeForTesting(createTestRecipe(id: '1'));

      await tester.pumpWidget(
        createTestWidget(
          child: const RecipeListPage(),
          mockRepository: mockRepository,
        ),
      );
      await tester.pumpAndSettle();

      // Should show one recipe
      expect(find.byType(RecipeCard), findsOneWidget);

      // Add another recipe
      mockRepository.addRecipeForTesting(createTestRecipe(id: '2'));

      // Trigger pull-to-refresh
      await tester.fling(find.byType(ListView), const Offset(0, 300), 1000);
      await tester.pumpAndSettle();

      // Should now show two recipes
      expect(find.byType(RecipeCard), findsNWidgets(2));
    });

    testWidgets('card tap navigates to detail page', (
      WidgetTester tester,
    ) async {
      mockRepository.addRecipeForTesting(createTestRecipe(id: 'recipe-123'));

      final router = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) => const RecipeListPage(),
          ),
          GoRoute(
            path: '/recipe/:id',
            builder: (context, state) {
              final id = state.pathParameters['id'];
              return Scaffold(body: Text('Recipe Detail: $id'));
            },
          ),
        ],
      );

      await tester.pumpWidget(
        createTestWidget(
          child: const RecipeListPage(),
          mockRepository: mockRepository,
          router: router,
        ),
      );
      await tester.pumpAndSettle();

      // Tap on the recipe card
      await tester.tap(find.byType(RecipeCard));
      await tester.pumpAndSettle();

      // Should navigate to detail page
      expect(find.text('Recipe Detail: recipe-123'), findsOneWidget);
    });

    group('RecipeCard', () {
      testWidgets('displays recipe title', (WidgetTester tester) async {
        await tester.pumpWidget(
          createTestWidget(
            child: Scaffold(
              body: RecipeCard(
                recipe: createTestRecipe(title: 'Delicious Pasta'),
              ),
            ),
            mockRepository: mockRepository,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Delicious Pasta'), findsOneWidget);
      });

      testWidgets('displays truncated source URL', (WidgetTester tester) async {
        await tester.pumpWidget(
          createTestWidget(
            child: Scaffold(
              body: RecipeCard(
                recipe: createTestRecipe(
                  sourceUrl: 'https://www.example.com/very/long/recipe/path',
                ),
              ),
            ),
            mockRepository: mockRepository,
          ),
        );
        await tester.pumpAndSettle();

        // URL should be truncated
        expect(find.textContaining('example.com'), findsOneWidget);
      });

      testWidgets('displays parsed status badge', (WidgetTester tester) async {
        await tester.pumpWidget(
          createTestWidget(
            child: Scaffold(
              body: RecipeCard(
                recipe: createTestRecipe(status: RecipeStatus.parsed),
              ),
            ),
            mockRepository: mockRepository,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Parsed'), findsOneWidget);
      });

      testWidgets('displays error status badge', (WidgetTester tester) async {
        await tester.pumpWidget(
          createTestWidget(
            child: Scaffold(
              body: RecipeCard(
                recipe: createTestRecipe(status: RecipeStatus.error),
              ),
            ),
            mockRepository: mockRepository,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Error'), findsOneWidget);
      });

      testWidgets('displays pending status badge', (WidgetTester tester) async {
        await tester.pumpWidget(
          createTestWidget(
            child: Scaffold(
              body: RecipeCard(
                recipe: createTestRecipe(status: RecipeStatus.pending),
              ),
            ),
            mockRepository: mockRepository,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Pending'), findsOneWidget);
      });

      testWidgets('displays draft status badge', (WidgetTester tester) async {
        await tester.pumpWidget(
          createTestWidget(
            child: Scaffold(
              body: RecipeCard(
                recipe: createTestRecipe(status: RecipeStatus.draft),
              ),
            ),
            mockRepository: mockRepository,
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Draft'), findsOneWidget);
      });
    });
  });
}
