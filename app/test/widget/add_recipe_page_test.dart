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

    testWidgets('renders link icon in URL TextField', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Find the URL TextField and verify it has the link icon prefix
      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.decoration?.prefixIcon, isA<Icon>());
      final icon = textField.decoration?.prefixIcon as Icon;
      expect(icon.icon, Icons.link);
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

    group('Tab/Toggle UI Tests', () {
      testWidgets('renders SegmentedButton with URL and Text options', (
        tester,
      ) async {
        await tester.pumpWidget(buildTestWidget());
        await tester.pumpAndSettle();

        expect(
          find.byType(SegmentedButton<AddRecipeInputMode>),
          findsOneWidget,
        );
        expect(find.text('From URL'), findsOneWidget);
        expect(find.text('From Text'), findsOneWidget);
        // SegmentedButton has icons but they may be duplicated elsewhere
        expect(find.byIcon(Icons.link), findsWidgets);
        expect(find.byIcon(Icons.text_fields), findsWidgets);
      });

      testWidgets('tapping From Text switches to text input mode', (
        tester,
      ) async {
        final testNotifier = _TestAddRecipeNotifier(const AddRecipeState());

        await tester.pumpWidget(
          ProviderScope(
            overrides: [addRecipeProvider.overrideWith(() => testNotifier)],
            child: MaterialApp.router(routerConfig: router),
          ),
        );
        await tester.pumpAndSettle();

        // Initially shows URL input
        expect(find.text('Recipe URL'), findsOneWidget);
        expect(find.text('Recipe Text'), findsNothing);

        // Tap From Text button
        await tester.tap(find.text('From Text'));
        await tester.pumpAndSettle();

        // Should show text input
        expect(find.text('Recipe Text'), findsOneWidget);
        expect(find.text('Recipe URL'), findsNothing);
      });

      testWidgets('tapping From URL switches back to URL input mode', (
        tester,
      ) async {
        final testNotifier = _TestAddRecipeNotifier(
          const AddRecipeState(inputMode: AddRecipeInputMode.text),
        );

        await tester.pumpWidget(
          ProviderScope(
            overrides: [addRecipeProvider.overrideWith(() => testNotifier)],
            child: MaterialApp.router(routerConfig: router),
          ),
        );
        await tester.pumpAndSettle();

        // Initially shows text input
        expect(find.text('Recipe Text'), findsOneWidget);
        expect(find.text('Recipe URL'), findsNothing);

        // Tap From URL button
        await tester.tap(find.text('From URL'));
        await tester.pumpAndSettle();

        // Should show URL input
        expect(find.text('Recipe URL'), findsOneWidget);
        expect(find.text('Recipe Text'), findsNothing);
      });

      testWidgets('text mode shows helper text when empty', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            initialState: const AddRecipeState(
              inputMode: AddRecipeInputMode.text,
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(
          find.text(
            'Enter at least 50 characters. You can paste recipes from cookbooks, websites, or type them directly.',
          ),
          findsOneWidget,
        );
      });

      testWidgets('text mode shows character counter', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            initialState: const AddRecipeState(
              inputMode: AddRecipeInputMode.text,
              textValue: 'This is some recipe text',
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('24 / 10000'), findsOneWidget);
      });

      testWidgets('character counter updates with text length', (tester) async {
        final testNotifier = _TestAddRecipeNotifier(
          const AddRecipeState(inputMode: AddRecipeInputMode.text),
        );

        await tester.pumpWidget(
          ProviderScope(
            overrides: [addRecipeProvider.overrideWith(() => testNotifier)],
            child: MaterialApp.router(routerConfig: router),
          ),
        );
        await tester.pumpAndSettle();

        // Initially empty
        expect(find.text('0 / 10000'), findsOneWidget);

        // Enter some text
        await tester.enterText(find.byType(TextField), 'Short text');
        await tester.pump();

        // Counter should update
        expect(find.text('10 / 10000'), findsOneWidget);
      });

      testWidgets('submit button is disabled for empty text', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            initialState: const AddRecipeState(
              inputMode: AddRecipeInputMode.text,
              textValue: '',
            ),
          ),
        );
        await tester.pumpAndSettle();

        final submitButton = find.widgetWithText(
          ElevatedButton,
          'Parse Recipe',
        );
        expect(submitButton, findsOneWidget);

        final button = tester.widget<ElevatedButton>(submitButton);
        expect(button.onPressed, isNull);
      });

      testWidgets('submit button is disabled for invalid text (short)', (
        tester,
      ) async {
        // When text is invalid, button is shown but disabled (not in error state yet)
        await tester.pumpWidget(
          buildTestWidget(
            initialState: const AddRecipeState(
              inputMode: AddRecipeInputMode.text,
              textValue: 'Short', // Less than minTextLength
              status: AddRecipeStatus.empty,
            ),
          ),
        );
        await tester.pumpAndSettle();

        final submitButton = find.widgetWithText(
          ElevatedButton,
          'Parse Recipe',
        );
        expect(submitButton, findsOneWidget);

        final button = tester.widget<ElevatedButton>(submitButton);
        expect(button.onPressed, isNull);
      });

      testWidgets('submit button is disabled for invalid text (long)', (
        tester,
      ) async {
        // When text is too long, button is shown but disabled
        final longText = 'A' * 10001;
        await tester.pumpWidget(
          buildTestWidget(
            initialState: AddRecipeState(
              inputMode: AddRecipeInputMode.text,
              textValue: longText,
              status: AddRecipeStatus.empty,
            ),
          ),
        );
        await tester.pumpAndSettle();

        final submitButton = find.widgetWithText(
          ElevatedButton,
          'Parse Recipe',
        );
        expect(submitButton, findsOneWidget);

        final button = tester.widget<ElevatedButton>(submitButton);
        expect(button.onPressed, isNull);
      });

      testWidgets('submit button is enabled for valid text length', (
        tester,
      ) async {
        await tester.pumpWidget(
          buildTestWidget(
            initialState: AddRecipeState(
              inputMode: AddRecipeInputMode.text,
              textValue: 'A' * 100, // Valid length (50-10000)
              status: AddRecipeStatus.empty,
            ),
          ),
        );
        await tester.pumpAndSettle();

        final submitButton = find.widgetWithText(
          ElevatedButton,
          'Parse Recipe',
        );
        final button = tester.widget<ElevatedButton>(submitButton);
        expect(button.onPressed, isNotNull);
      });

      testWidgets('shows error message for text too short', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            initialState: const AddRecipeState(
              inputMode: AddRecipeInputMode.text,
              textValue: 'Short',
              status: AddRecipeStatus.error,
              errorCode: AddRecipeErrorCode.textTooShort,
              errorMessage: 'Recipe text must be at least 50 characters',
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Text Too Short'), findsOneWidget);
      });

      testWidgets('shows error message for text too long', (tester) async {
        final longText = 'A' * 10001;
        await tester.pumpWidget(
          buildTestWidget(
            initialState: AddRecipeState(
              inputMode: AddRecipeInputMode.text,
              textValue: longText,
              status: AddRecipeStatus.error,
              errorCode: AddRecipeErrorCode.textTooLong,
              errorMessage: 'Recipe text must be less than 10000 characters',
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Text Too Long'), findsOneWidget);
      });

      testWidgets('shows error message when URL detected in text', (
        tester,
      ) async {
        await tester.pumpWidget(
          buildTestWidget(
            initialState: const AddRecipeState(
              inputMode: AddRecipeInputMode.text,
              textValue: 'https://example.com/recipe',
              status: AddRecipeStatus.error,
              errorCode: AddRecipeErrorCode.urlDetected,
              errorMessage: 'Please use the URL import tab instead',
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('URL Detected'), findsOneWidget);
      });

      testWidgets('text input field has correct configuration', (tester) async {
        await tester.pumpWidget(
          buildTestWidget(
            initialState: const AddRecipeState(
              inputMode: AddRecipeInputMode.text,
            ),
          ),
        );
        await tester.pumpAndSettle();

        final textField = tester.widget<TextField>(find.byType(TextField));
        expect(textField.maxLines, 10);
        expect(textField.minLines, 8);
        expect(textField.keyboardType, TextInputType.multiline);
        expect(textField.decoration?.labelText, 'Recipe Text');
        expect(textField.decoration?.hintText, 'Paste your recipe here...');
      });

      testWidgets('submit button shows Save Recipe in URL mode', (
        tester,
      ) async {
        await tester.pumpWidget(
          buildTestWidget(
            initialState: const AddRecipeState(
              inputMode: AddRecipeInputMode.url,
              url: 'https://example.com',
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Save Recipe'), findsOneWidget);
        expect(find.text('Parse Recipe'), findsNothing);
      });

      testWidgets('submit button shows Parse Recipe in Text mode', (
        tester,
      ) async {
        await tester.pumpWidget(
          buildTestWidget(
            initialState: AddRecipeState(
              inputMode: AddRecipeInputMode.text,
              textValue: 'A' * 100,
              status: AddRecipeStatus.empty,
            ),
          ),
        );
        await tester.pumpAndSettle();

        expect(find.text('Parse Recipe'), findsOneWidget);
        expect(find.text('Save Recipe'), findsNothing);
      });
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
