import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:app/presentation/pages/add_recipe_page.dart';
import 'package:app/presentation/providers/add_recipe_provider.dart';
import 'package:app/data/models/recipe.dart';

void main() {
  group('AddRecipePage Widget Tests', () {
    late GoRouter router;

    setUp(() {
      router = GoRouter(
        initialLocation: '/add',
        routes: [
          GoRoute(
            path: '/add',
            builder: (context, state) => const AddRecipePage(),
          ),
          GoRoute(
            path: '/recipe/:id',
            builder: (context, state) {
              final id = state.pathParameters['id'];
              return Scaffold(body: Text('Recipe: $id'));
            },
          ),
        ],
      );
    });

    Recipe createTestRecipe({String id = 'test-recipe-id'}) {
      return Recipe(
        id: id,
        title: 'Test Recipe',
        status: RecipeStatus.parsed,
        userId: 'user-123',
        createdAt: DateTime(2024, 1, 1),
        updatedAt: DateTime(2024, 1, 1),
      );
    }

    Widget buildTestWidget({AddRecipeState? initialState}) {
      return ProviderScope(
        overrides: [
          // Override with a provider that returns our custom notifier
          addRecipeProvider.overrideWith(
            () =>
                _TestAddRecipeNotifier(initialState ?? const AddRecipeState()),
          ),
        ],
        child: MaterialApp.router(routerConfig: router),
      );
    }

    testWidgets('renders AppBar with Add Recipe title', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.byType(AppBar), findsOneWidget);
      expect(find.text('Add Recipe'), findsOneWidget);
    });

    testWidgets('renders close button in AppBar', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.close), findsOneWidget);
    });

    testWidgets('renders TextField with URL input', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('Recipe URL'), findsOneWidget);
      expect(find.text('Paste Recipe URL'), findsOneWidget);
    });

    testWidgets('renders link icon in TextField', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.link), findsOneWidget);
    });

    testWidgets('submit button is disabled for empty URL', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final submitButton = find.widgetWithText(ElevatedButton, 'Save Recipe');
      expect(submitButton, findsOneWidget);

      final button = tester.widget<ElevatedButton>(submitButton);
      expect(button.onPressed, isNull);
    });

    testWidgets('submit button is disabled for invalid URL', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'not-a-valid-url',
            status: AddRecipeStatus.invalidUrl,
            errorCode: AddRecipeErrorCode.invalidUrl,
          ),
        ),
      );
      await tester.pumpAndSettle();

      final submitButton = find.widgetWithText(ElevatedButton, 'Save Recipe');
      final button = tester.widget<ElevatedButton>(submitButton);
      expect(button.onPressed, isNull);
    });

    testWidgets('submit button is enabled for valid URL', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.empty,
          ),
        ),
      );
      await tester.pumpAndSettle();

      final submitButton = find.widgetWithText(ElevatedButton, 'Save Recipe');
      final button = tester.widget<ElevatedButton>(submitButton);
      expect(button.onPressed, isNotNull);
    });

    testWidgets('shows loading indicator during fetching', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.fetching,
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Fetching recipe...'), findsOneWidget);
    });

    testWidgets('shows loading indicator during parsing', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.parsing,
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Parsing recipe...'), findsOneWidget);
    });

    testWidgets('shows success message with View Recipe button', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.success,
            result: createTestRecipe(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Recipe Added!'), findsOneWidget);
      expect(find.text('View Recipe'), findsOneWidget);
      expect(find.byIcon(Icons.visibility), findsOneWidget);
    });

    testWidgets('shows error message for invalid URL', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'invalid-url',
            status: AddRecipeStatus.error,
            errorCode: AddRecipeErrorCode.invalidUrl,
            errorMessage: 'Please enter a valid URL',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Invalid URL'), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });

    testWidgets('shows error message for fetch failed', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.error,
            errorCode: AddRecipeErrorCode.fetchFailed,
            errorMessage: 'Unable to fetch',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Connection Failed'), findsOneWidget);
    });

    testWidgets('shows error message for parse failed', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.error,
            errorCode: AddRecipeErrorCode.parseFailed,
            errorMessage: 'Parsing failed',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Parsing Failed'), findsOneWidget);
    });

    testWidgets('shows error message for rate limit', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.error,
            errorCode: AddRecipeErrorCode.rateLimit,
            errorMessage: 'Too many requests',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Too Many Requests'), findsOneWidget);
    });

    testWidgets('shows retry button for fetch failed error', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.error,
            errorCode: AddRecipeErrorCode.fetchFailed,
            errorMessage: 'Unable to fetch',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Retry'), findsOneWidget);
      expect(find.byIcon(Icons.refresh), findsOneWidget);
    });

    testWidgets('shows retry button for rate limit error', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.error,
            errorCode: AddRecipeErrorCode.rateLimit,
            errorMessage: 'Too many requests',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('shows Try Again button for non-retryable errors', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: const AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.error,
            errorCode: AddRecipeErrorCode.parseFailed,
            errorMessage: 'Parsing failed',
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Try Again'), findsOneWidget);
      expect(find.text('Retry'), findsNothing);
    });

    testWidgets('shows Add Another Recipe on success', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.success,
            result: createTestRecipe(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Add Another Recipe'), findsOneWidget);
    });

    testWidgets('navigates to recipe detail when View Recipe tapped', (
      tester,
    ) async {
      await tester.pumpWidget(
        buildTestWidget(
          initialState: AddRecipeState(
            url: 'https://example.com/recipe',
            status: AddRecipeStatus.success,
            result: createTestRecipe(id: 'test-recipe-id'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('View Recipe'));
      await tester.pumpAndSettle();

      expect(find.text('Recipe: test-recipe-id'), findsOneWidget);
    });

    testWidgets('URL input text is reflected in TextField', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      final textField = find.byType(TextField);
      await tester.enterText(textField, 'https://example.com/recipe');
      await tester.pump();

      final textFieldWidget = tester.widget<TextField>(textField);
      expect(textFieldWidget.controller?.text, 'https://example.com/recipe');
    });
  });
}

/// Test notifier that properly overrides build() to return the desired state
class _TestAddRecipeNotifier extends AddRecipe {
  _TestAddRecipeNotifier(this._initialState);

  final AddRecipeState _initialState;

  @override
  AddRecipeState build() => _initialState;

  @override
  void setUrl(String url) {
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
