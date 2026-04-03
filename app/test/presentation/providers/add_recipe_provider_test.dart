import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart'
    hide RecipeNotFoundException;
import 'package:app/presentation/providers/add_recipe_provider.dart';
import 'package:app/presentation/providers/providers.dart';

/// Mock implementation of IRecipeRepository for testing.
class MockRecipeRepository implements IRecipeRepository {
  final List<Recipe> _recipes = [];

  /// Configurable behavior for createRecipe.
  Future<Recipe> Function(String url)? createRecipeBehavior;

  /// Configurable behavior for createRecipeFromText.
  Future<Recipe> Function(String text)? createRecipeFromTextBehavior;

  @override
  Future<List<Recipe>> getRecipes() async {
    return List.unmodifiable(_recipes);
  }

  @override
  Future<Recipe> getRecipe(String id) async {
    return _recipes.firstWhere((r) => r.id == id);
  }

  @override
  Future<Recipe> createRecipe(String url) async {
    if (createRecipeBehavior != null) {
      return createRecipeBehavior!(url);
    }
    final recipe = Recipe(
      id: 'test-recipe-${_recipes.length + 1}',
      title: 'Test Recipe',
      sourceUrl: url,
      status: RecipeStatus.parsed,
      userId: 'test-user',
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    _recipes.add(recipe);
    return recipe;
  }

  @override
  Stream<Recipe> watchRecipe(String id) {
    return const Stream.empty();
  }

  @override
  Future<void> deleteRecipe(String id) async {
    _recipes.removeWhere((r) => r.id == id);
  }

  @override
  Future<Recipe> createRecipeFromText(String text) async {
    if (createRecipeFromTextBehavior != null) {
      return createRecipeFromTextBehavior!(text);
    }
    final recipe = Recipe(
      id: 'test-recipe-text-${_recipes.length + 1}',
      title: 'Test Recipe from Text',
      status: RecipeStatus.parsed,
      userId: 'test-user',
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    _recipes.add(recipe);
    return recipe;
  }
}

void main() {
  group('AddRecipeState', () {
    test('has correct default values', () {
      const state = AddRecipeState();

      expect(state.url, equals(''));
      expect(state.status, equals(AddRecipeStatus.empty));
      expect(state.errorCode, equals(AddRecipeErrorCode.unknown));
      expect(state.errorMessage, equals(''));
      expect(state.result, isNull);
    });

    test('can be constructed with custom values', () {
      final recipe = Recipe(
        id: 'test-id',
        title: 'Test',
        status: RecipeStatus.parsed,
        userId: 'user',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      final state = AddRecipeState(
        url: 'https://example.com/recipe',
        status: AddRecipeStatus.success,
        errorCode: AddRecipeErrorCode.unknown,
        errorMessage: '',
        result: recipe,
      );

      expect(state.url, equals('https://example.com/recipe'));
      expect(state.status, equals(AddRecipeStatus.success));
      expect(state.result, equals(recipe));
    });

    test('copyWith creates new instance with updated fields', () {
      const original = AddRecipeState();
      final updated = original.copyWith(
        url: 'https://example.com/recipe',
        status: AddRecipeStatus.invalidUrl,
      );

      expect(updated.url, equals('https://example.com/recipe'));
      expect(updated.status, equals(AddRecipeStatus.invalidUrl));
      expect(original.url, equals('')); // Original unchanged
      expect(original.status, equals(AddRecipeStatus.empty));
    });

    test('equality works correctly', () {
      const state1 = AddRecipeState();
      const state2 = AddRecipeState();
      const state3 = AddRecipeState(url: 'https://example.com');

      expect(state1 == state2, isTrue);
      expect(state1 == state3, isFalse);
    });
  });

  group('AddRecipeErrorCode', () {
    test('has all expected values', () {
      expect(
        AddRecipeErrorCode.values,
        containsAll([
          AddRecipeErrorCode.invalidUrl,
          AddRecipeErrorCode.fetchFailed,
          AddRecipeErrorCode.parseFailed,
          AddRecipeErrorCode.rateLimit,
          AddRecipeErrorCode.duplicateUrl,
          AddRecipeErrorCode.unknown,
        ]),
      );
    });
  });

  group('AddRecipeStatus', () {
    test('has all expected values', () {
      expect(
        AddRecipeStatus.values,
        containsAll([
          AddRecipeStatus.empty,
          AddRecipeStatus.invalidUrl,
          AddRecipeStatus.fetching,
          AddRecipeStatus.parsing,
          AddRecipeStatus.success,
          AddRecipeStatus.error,
        ]),
      );
    });
  });

  group('AddRecipe Provider', () {
    late MockRecipeRepository mockRepository;
    late ProviderContainer container;

    setUp(() {
      mockRepository = MockRecipeRepository();
      container = ProviderContainer(
        overrides: [recipeRepositoryProvider.overrideWithValue(mockRepository)],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test('initial state is empty', () {
      final state = container.read(addRecipeProvider);

      expect(state.url, equals(''));
      expect(state.status, equals(AddRecipeStatus.empty));
      expect(state.errorCode, equals(AddRecipeErrorCode.unknown));
      expect(state.errorMessage, equals(''));
      expect(state.result, isNull);
    });

    group('setUrl', () {
      test('empty URL resets state to default', () {
        container.read(addRecipeProvider.notifier).setUrl('');

        final state = container.read(addRecipeProvider);
        expect(state.url, equals(''));
        expect(state.status, equals(AddRecipeStatus.empty));
      });

      test('whitespace-only URL resets state to default', () {
        container.read(addRecipeProvider.notifier).setUrl('   ');

        final state = container.read(addRecipeProvider);
        expect(state.url, equals(''));
        expect(state.status, equals(AddRecipeStatus.empty));
      });

      test('valid URL sets status to empty', () {
        container
            .read(addRecipeProvider.notifier)
            .setUrl('https://example.com/recipe');

        final state = container.read(addRecipeProvider);
        expect(state.url, equals('https://example.com/recipe'));
        expect(state.status, equals(AddRecipeStatus.empty));
        expect(state.errorCode, equals(AddRecipeErrorCode.unknown));
        expect(state.errorMessage, equals(''));
      });

      test('invalid URL sets status to invalidUrl', () {
        container.read(addRecipeProvider.notifier).setUrl('not-a-valid-url');

        final state = container.read(addRecipeProvider);
        expect(state.url, equals('not-a-valid-url'));
        expect(state.status, equals(AddRecipeStatus.invalidUrl));
        expect(state.errorCode, equals(AddRecipeErrorCode.invalidUrl));
        expect(state.errorMessage, equals('Please enter a valid URL'));
      });

      test('URL is trimmed', () {
        container
            .read(addRecipeProvider.notifier)
            .setUrl('  https://example.com/recipe  ');

        final state = container.read(addRecipeProvider);
        expect(state.url, equals('https://example.com/recipe'));
      });
    });

    group('submit', () {
      test('empty URL shows invalidUrl error', () async {
        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.invalidUrl));
        expect(state.errorCode, equals(AddRecipeErrorCode.invalidUrl));
      });

      test('invalid URL format shows invalidUrl error', () async {
        // First set an invalid URL
        container.read(addRecipeProvider.notifier).setUrl('not-a-url');

        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.invalidUrl));
        expect(state.errorCode, equals(AddRecipeErrorCode.invalidUrl));
      });

      test('successful submission sets status to success', () async {
        final createdRecipe = Recipe(
          id: 'new-recipe-id',
          title: 'Parsed Recipe',
          sourceUrl: 'https://example.com/recipe',
          status: RecipeStatus.parsed,
          userId: 'test-user',
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        mockRepository.createRecipeBehavior = (url) async => createdRecipe;

        // First set a valid URL
        container
            .read(addRecipeProvider.notifier)
            .setUrl('https://example.com/recipe');

        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.success));
        expect(state.result, equals(createdRecipe));
      });

      test('fetch failure sets error status with fetchFailed', () async {
        mockRepository.createRecipeBehavior = (_) async {
          throw const NetworkException(
            message: 'Connection failed',
            retryable: true,
          );
        };

        container
            .read(addRecipeProvider.notifier)
            .setUrl('https://example.com/recipe');
        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.fetchFailed));
        expect(state.errorMessage, contains('Network'));
      });

      test('parse failure sets error status with parseFailed', () async {
        mockRepository.createRecipeBehavior = (_) async {
          throw const ParseException(
            message: 'Parse failed',
            errorCode: ErrorCode.parseFailed,
          );
        };

        container
            .read(addRecipeProvider.notifier)
            .setUrl('https://example.com/recipe');
        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.parseFailed));
      });

      test('validation failure sets error status with invalidUrl', () async {
        mockRepository.createRecipeBehavior = (_) async {
          throw const ValidationException(message: 'Invalid URL');
        };

        container
            .read(addRecipeProvider.notifier)
            .setUrl('https://example.com/recipe');
        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.invalidUrl));
      });

      test('duplicate URL sets error status with duplicateUrl', () async {
        mockRepository.createRecipeBehavior = (_) async {
          throw const DatabaseException(message: 'Duplicate entry');
        };

        container
            .read(addRecipeProvider.notifier)
            .setUrl('https://example.com/recipe');
        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.duplicateUrl));
        expect(state.errorMessage, contains('already been added'));
      });

      test('rate limit sets error status with rateLimit', () async {
        mockRepository.createRecipeBehavior = (_) async {
          throw const ParseException(
            message: 'Rate limit exceeded',
            errorCode: ErrorCode.rateLimit,
          );
        };

        container
            .read(addRecipeProvider.notifier)
            .setUrl('https://example.com/recipe');
        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.rateLimit));
      });

      test('unknown error sets unknown error code', () async {
        mockRepository.createRecipeBehavior = (_) async {
          throw Exception('Unexpected error');
        };

        container
            .read(addRecipeProvider.notifier)
            .setUrl('https://example.com/recipe');
        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.unknown));
      });
    });

    group('reset', () {
      test('reset clears all state', () async {
        final createdRecipe = Recipe(
          id: 'new-recipe-id',
          title: 'Parsed Recipe',
          sourceUrl: 'https://example.com/recipe',
          status: RecipeStatus.parsed,
          userId: 'test-user',
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        mockRepository.createRecipeBehavior = (url) async => createdRecipe;

        // Set URL and submit
        container
            .read(addRecipeProvider.notifier)
            .setUrl('https://example.com/recipe');
        await container.read(addRecipeProvider.notifier).submit();
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.success),
        );

        // Reset
        container.read(addRecipeProvider.notifier).reset();

        final state = container.read(addRecipeProvider);
        expect(state.url, equals(''));
        expect(state.status, equals(AddRecipeStatus.empty));
        expect(state.errorCode, equals(AddRecipeErrorCode.unknown));
        expect(state.errorMessage, equals(''));
        expect(state.result, isNull);
      });
    });

    group('state flow', () {
      test('follows correct state flow for successful submission', () async {
        final createdRecipe = Recipe(
          id: 'new-recipe-id',
          title: 'Parsed Recipe',
          status: RecipeStatus.parsed,
          userId: 'test-user',
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        mockRepository.createRecipeBehavior = (url) async => createdRecipe;

        final notifier = container.read(addRecipeProvider.notifier);

        // Empty -> Valid URL
        notifier.setUrl('https://example.com/recipe');
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.empty),
        );

        // Submit -> Success
        await notifier.submit();
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.success),
        );

        // Reset -> Empty
        notifier.reset();
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.empty),
        );
      });

      test('follows correct state flow for failed submission', () async {
        mockRepository.createRecipeBehavior = (_) async {
          throw const NetworkException(message: 'Failed', retryable: false);
        };

        final notifier = container.read(addRecipeProvider.notifier);

        // Empty -> Valid URL
        notifier.setUrl('https://example.com/recipe');
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.empty),
        );

        // Submit -> Error
        await notifier.submit();
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.error),
        );
        expect(
          container.read(addRecipeProvider).errorCode,
          equals(AddRecipeErrorCode.fetchFailed),
        );

        // Reset -> Empty
        notifier.reset();
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.empty),
        );
      });
    });

    group('setInputMode', () {
      test('switching to text mode resets state and sets inputMode', () {
        final notifier = container.read(addRecipeProvider.notifier);

        // Start in URL mode with some data
        notifier.setUrl('https://example.com/recipe');
        expect(
          container.read(addRecipeProvider).inputMode,
          equals(AddRecipeInputMode.url),
        );
        expect(
          container.read(addRecipeProvider).url,
          equals('https://example.com/recipe'),
        );

        // Switch to text mode
        notifier.setInputMode(AddRecipeInputMode.text);

        final state = container.read(addRecipeProvider);
        expect(state.inputMode, equals(AddRecipeInputMode.text));
        expect(state.url, equals(''));
        expect(state.textValue, equals(''));
        expect(state.status, equals(AddRecipeStatus.empty));
        expect(state.errorCode, equals(AddRecipeErrorCode.unknown));
      });

      test('switching to url mode resets state and sets inputMode', () {
        final notifier = container.read(addRecipeProvider.notifier);

        // Start in text mode with some data
        notifier.setInputMode(AddRecipeInputMode.text);
        notifier.setTextValue('a' * 100); // Valid text
        expect(
          container.read(addRecipeProvider).inputMode,
          equals(AddRecipeInputMode.text),
        );
        expect(container.read(addRecipeProvider).textValue, equals('a' * 100));

        // Switch to url mode
        notifier.setInputMode(AddRecipeInputMode.url);

        final state = container.read(addRecipeProvider);
        expect(state.inputMode, equals(AddRecipeInputMode.url));
        expect(state.url, equals(''));
        expect(state.textValue, equals(''));
        expect(state.status, equals(AddRecipeStatus.empty));
      });

      test('switching to same mode does nothing', () {
        final notifier = container.read(addRecipeProvider.notifier);

        // Set some URL data
        notifier.setUrl('https://example.com/recipe');
        expect(
          container.read(addRecipeProvider).url,
          equals('https://example.com/recipe'),
        );

        // Switch to same mode (url)
        notifier.setInputMode(AddRecipeInputMode.url);

        // State should remain unchanged
        final state = container.read(addRecipeProvider);
        expect(state.url, equals('https://example.com/recipe'));
        expect(state.inputMode, equals(AddRecipeInputMode.url));
      });
    });

    group('setTextValue', () {
      test('empty text resets state to default', () {
        container.read(addRecipeProvider.notifier).setTextValue('');

        final state = container.read(addRecipeProvider);
        expect(state.textValue, equals(''));
        expect(state.status, equals(AddRecipeStatus.empty));
      });

      test('whitespace-only text resets state to default', () {
        container.read(addRecipeProvider.notifier).setTextValue('   ');

        final state = container.read(addRecipeProvider);
        expect(state.textValue, equals(''));
        expect(state.status, equals(AddRecipeStatus.empty));
      });

      test('text too short sets error status', () {
        // Text less than 50 characters
        container.read(addRecipeProvider.notifier).setTextValue('Too short');

        final state = container.read(addRecipeProvider);
        expect(state.textValue, equals('Too short'));
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.textTooShort));
        expect(state.errorMessage, contains('at least 50 characters'));
      });

      test('text too long sets error status', () {
        // Text more than 10000 characters
        container.read(addRecipeProvider.notifier).setTextValue('a' * 10001);

        final state = container.read(addRecipeProvider);
        expect(state.textValue, equals('a' * 10001));
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.textTooLong));
        expect(state.errorMessage, contains('less than 10000 characters'));
      });

      test('text that is only a URL sets urlDetected error', () {
        // The regex ^...$ only matches if entire text is a URL
        container
            .read(addRecipeProvider.notifier)
            .setTextValue('https://example.com/recipe');

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.urlDetected));
        expect(state.errorMessage, contains('not a URL'));
      });

      test('valid text sets empty status', () {
        // Text between 50-10000 characters without URL
        final validText = '${'This is a valid recipe text '}${'x' * 50}';
        container.read(addRecipeProvider.notifier).setTextValue(validText);

        final state = container.read(addRecipeProvider);
        expect(state.textValue, equals(validText));
        expect(state.status, equals(AddRecipeStatus.empty));
        expect(state.errorCode, equals(AddRecipeErrorCode.unknown));
        expect(state.errorMessage, equals(''));
      });

      test('text is trimmed', () {
        final validText = 'x' * 50;
        container
            .read(addRecipeProvider.notifier)
            .setTextValue('  $validText  ');

        final state = container.read(addRecipeProvider);
        expect(state.textValue, equals(validText));
      });
    });

    group('submit with text input', () {
      test('empty text shows textTooShort error', () async {
        // Switch to text mode
        container
            .read(addRecipeProvider.notifier)
            .setInputMode(AddRecipeInputMode.text);

        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.textTooShort));
      });

      test('text too short shows textTooShort error', () async {
        container
            .read(addRecipeProvider.notifier)
            .setInputMode(AddRecipeInputMode.text);
        container.read(addRecipeProvider.notifier).setTextValue('short');

        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.textTooShort));
      });

      test('text that is only a URL shows urlDetected error on submit', () async {
        container
            .read(addRecipeProvider.notifier)
            .setInputMode(AddRecipeInputMode.text);
        // URL must be at least 50 chars to pass length check before URL detection
        // Using a long URL path to exceed min length
        container
            .read(addRecipeProvider.notifier)
            .setTextValue(
              'https://example.com/recipe/chocolate-cake-moist-delicious-dessert',
            );

        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.urlDetected));
      });

      test('successful text submission sets status to success', () async {
        final createdRecipe = Recipe(
          id: 'text-recipe-id',
          title: 'Parsed Recipe from Text',
          status: RecipeStatus.parsed,
          userId: 'test-user',
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        mockRepository.createRecipeFromTextBehavior = (text) async =>
            createdRecipe;

        container
            .read(addRecipeProvider.notifier)
            .setInputMode(AddRecipeInputMode.text);
        container.read(addRecipeProvider.notifier).setTextValue('x' * 100);

        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.success));
        expect(state.result, equals(createdRecipe));
      });

      test('parse failure sets error status with parseFailed', () async {
        mockRepository.createRecipeFromTextBehavior = (_) async {
          throw const ParseException(
            message: 'Could not parse recipe',
            errorCode: ErrorCode.parseFailed,
          );
        };

        container
            .read(addRecipeProvider.notifier)
            .setInputMode(AddRecipeInputMode.text);
        container.read(addRecipeProvider.notifier).setTextValue('x' * 100);

        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.parseFailed));
        expect(state.errorMessage, contains('Could not parse'));
      });

      test('url detected during submission sets urlDetected error', () async {
        mockRepository.createRecipeFromTextBehavior = (_) async {
          throw const ParseException(
            message: 'URL detected in text',
            errorCode: ErrorCode.urlDetectedInText,
          );
        };

        container
            .read(addRecipeProvider.notifier)
            .setInputMode(AddRecipeInputMode.text);
        container.read(addRecipeProvider.notifier).setTextValue('x' * 100);

        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.urlDetected));
      });

      test(
        'text too short during submission sets textTooShort error',
        () async {
          mockRepository.createRecipeFromTextBehavior = (_) async {
            throw const ValidationException(
              message: 'Text too short',
              errorCode: ErrorCode.textTooShort,
            );
          };

          container
              .read(addRecipeProvider.notifier)
              .setInputMode(AddRecipeInputMode.text);
          container.read(addRecipeProvider.notifier).setTextValue('x' * 100);

          await container.read(addRecipeProvider.notifier).submit();

          final state = container.read(addRecipeProvider);
          expect(state.status, equals(AddRecipeStatus.error));
          expect(state.errorCode, equals(AddRecipeErrorCode.textTooShort));
        },
      );

      test('text too long during submission sets textTooLong error', () async {
        mockRepository.createRecipeFromTextBehavior = (_) async {
          throw const ValidationException(
            message: 'Text too long',
            errorCode: ErrorCode.textTooLong,
          );
        };

        container
            .read(addRecipeProvider.notifier)
            .setInputMode(AddRecipeInputMode.text);
        container.read(addRecipeProvider.notifier).setTextValue('x' * 100);

        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.textTooLong));
      });

      test('rate limit during text submission sets rateLimit error', () async {
        mockRepository.createRecipeFromTextBehavior = (_) async {
          throw const ParseException(
            message: 'Rate limit exceeded',
            errorCode: ErrorCode.rateLimit,
          );
        };

        container
            .read(addRecipeProvider.notifier)
            .setInputMode(AddRecipeInputMode.text);
        container.read(addRecipeProvider.notifier).setTextValue('x' * 100);

        await container.read(addRecipeProvider.notifier).submit();

        final state = container.read(addRecipeProvider);
        expect(state.status, equals(AddRecipeStatus.error));
        expect(state.errorCode, equals(AddRecipeErrorCode.rateLimit));
      });

      test(
        'unknown error during text submission sets unknown error code',
        () async {
          mockRepository.createRecipeFromTextBehavior = (_) async {
            throw Exception('Unexpected error');
          };

          container
              .read(addRecipeProvider.notifier)
              .setInputMode(AddRecipeInputMode.text);
          container.read(addRecipeProvider.notifier).setTextValue('x' * 100);

          await container.read(addRecipeProvider.notifier).submit();

          final state = container.read(addRecipeProvider);
          expect(state.status, equals(AddRecipeStatus.error));
          expect(state.errorCode, equals(AddRecipeErrorCode.unknown));
        },
      );
    });

    group('text state flow', () {
      test(
        'follows correct state flow for successful text submission',
        () async {
          final createdRecipe = Recipe(
            id: 'text-recipe-id',
            title: 'Parsed from Text',
            status: RecipeStatus.parsed,
            userId: 'test-user',
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          );
          mockRepository.createRecipeFromTextBehavior = (text) async =>
              createdRecipe;

          final notifier = container.read(addRecipeProvider.notifier);

          // Switch to text mode -> Empty
          notifier.setInputMode(AddRecipeInputMode.text);
          expect(
            container.read(addRecipeProvider).inputMode,
            equals(AddRecipeInputMode.text),
          );
          expect(
            container.read(addRecipeProvider).status,
            equals(AddRecipeStatus.empty),
          );

          // Valid text -> Empty (valid)
          notifier.setTextValue('x' * 100);
          expect(
            container.read(addRecipeProvider).status,
            equals(AddRecipeStatus.empty),
          );
          expect(
            container.read(addRecipeProvider).errorCode,
            equals(AddRecipeErrorCode.unknown),
          );

          // Submit -> Success
          await notifier.submit();
          expect(
            container.read(addRecipeProvider).status,
            equals(AddRecipeStatus.success),
          );
          expect(
            container.read(addRecipeProvider).result,
            equals(createdRecipe),
          );

          // Reset -> Empty
          notifier.reset();
          expect(
            container.read(addRecipeProvider).status,
            equals(AddRecipeStatus.empty),
          );
          expect(
            container.read(addRecipeProvider).inputMode,
            equals(AddRecipeInputMode.url),
          ); // reset clears to default
        },
      );

      test('follows correct state flow for failed text submission', () async {
        mockRepository.createRecipeFromTextBehavior = (_) async {
          throw const ParseException(
            message: 'Parse failed',
            errorCode: ErrorCode.parseFailed,
          );
        };

        final notifier = container.read(addRecipeProvider.notifier);

        // Switch to text mode
        notifier.setInputMode(AddRecipeInputMode.text);

        // Valid text
        notifier.setTextValue('x' * 100);
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.empty),
        );

        // Submit -> Error
        await notifier.submit();
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.error),
        );
        expect(
          container.read(addRecipeProvider).errorCode,
          equals(AddRecipeErrorCode.parseFailed),
        );

        // Reset -> Empty
        notifier.reset();
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.empty),
        );
      });

      test('state transitions from empty to typing to error to valid', () {
        final notifier = container.read(addRecipeProvider.notifier);
        notifier.setInputMode(AddRecipeInputMode.text);

        // Empty state
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.empty),
        );

        // Typing too short -> Error
        notifier.setTextValue('short');
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.error),
        );
        expect(
          container.read(addRecipeProvider).errorCode,
          equals(AddRecipeErrorCode.textTooShort),
        );

        // Typing valid text -> Empty (valid)
        notifier.setTextValue('x' * 100);
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.empty),
        );
        expect(
          container.read(addRecipeProvider).errorCode,
          equals(AddRecipeErrorCode.unknown),
        );

        // Typing text that is only a URL -> Error (regex ^...$ requires entire match)
        notifier.setTextValue('https://example.com/recipe');
        expect(
          container.read(addRecipeProvider).status,
          equals(AddRecipeStatus.error),
        );
        expect(
          container.read(addRecipeProvider).errorCode,
          equals(AddRecipeErrorCode.urlDetected),
        );
      });
    });
  });
}
