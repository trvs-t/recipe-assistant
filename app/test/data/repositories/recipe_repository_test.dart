import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart'
    hide RecipeNotFoundException;
import 'package:app/data/repositories/recipe_repository.dart';

// --- Mock Repository for testing ---

/// A simple mock of IRecipeRepository for testing the interface contract.
class MockRecipeRepository implements IRecipeRepository {
  final List<Recipe> _recipes = [];
  final _recipeControllers = <String, StreamController<Recipe>>{};

  @override
  Future<List<Recipe>> getRecipes() async {
    return List.unmodifiable(_recipes);
  }

  @override
  Future<Recipe> getRecipe(String id) async {
    final recipe = _recipes.firstWhere(
      (r) => r.id == id,
      orElse: () => throw RecipeNotFoundException(recipeId: id),
    );
    return recipe;
  }

  @override
  Future<Recipe> createRecipe(String url) async {
    final recipe = Recipe(
      id: 'test-recipe-${_recipes.length + 1}',
      title: 'Test Recipe',
      sourceUrl: url,
      status: RecipeStatus.pending,
      userId: 'test-user',
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
    _recipes.add(recipe);
    return recipe;
  }

  @override
  Stream<Recipe> watchRecipe(String id) {
    final controller = _recipeControllers.putIfAbsent(
      id,
      () => StreamController<Recipe>.broadcast(),
    );
    return controller.stream;
  }

  @override
  Future<void> deleteRecipe(String id) async {
    _recipes.removeWhere((r) => r.id == id);
  }

  void addRecipeForTesting(Recipe recipe) {
    _recipes.add(recipe);
  }
}

void main() {
  group('IRecipeRepository Interface Contract', () {
    late MockRecipeRepository repository;

    setUp(() {
      repository = MockRecipeRepository();
    });

    test('getRecipes returns Future<List<Recipe>>', () async {
      final result = await repository.getRecipes();
      expect(result, isA<List<Recipe>>());
    });

    test('getRecipe returns Future<Recipe>', () async {
      final created = await repository.createRecipe(
        'https://example.com/recipe',
      );
      final result = await repository.getRecipe(created.id);
      expect(result, isA<Recipe>());
      expect(result.id, equals(created.id));
    });

    test('getRecipe throws RecipeNotFoundException for unknown id', () async {
      expect(
        () => repository.getRecipe('non-existent-id'),
        throwsA(isA<RecipeNotFoundException>()),
      );
    });

    test('createRecipe returns Future<Recipe>', () async {
      final result = await repository.createRecipe(
        'https://example.com/recipe',
      );
      expect(result, isA<Recipe>());
      expect(result.status, equals(RecipeStatus.pending));
    });

    test('watchRecipe returns Stream<Recipe>', () {
      final stream = repository.watchRecipe('test-id');
      expect(stream, isA<Stream<Recipe>>());
    });

    test('deleteRecipe returns Future<void>', () async {
      final created = await repository.createRecipe(
        'https://example.com/recipe',
      );
      await repository.deleteRecipe(created.id);
      expect(
        () => repository.getRecipe(created.id),
        throwsA(isA<RecipeNotFoundException>()),
      );
    });
  });

  group('RecipeRepository helper classes', () {
    group('ValidateUrlResponse', () {
      test('can be constructed with valid flag', () {
        const response = ValidateUrlResponse(valid: true);
        expect(response.valid, isTrue);
        expect(response.reason, isNull);
        expect(response.retryable, isNull);
      });

      test('can be constructed with all fields', () {
        const response = ValidateUrlResponse(
          valid: false,
          reason: 'MALFORMED_URL',
          retryable: false,
        );
        expect(response.valid, isFalse);
        expect(response.reason, equals('MALFORMED_URL'));
        expect(response.retryable, isFalse);
      });
    });

    group('ParseRecipeResponse', () {
      test('can be constructed for success case', () {
        const response = ParseRecipeResponse(
          success: true,
          data: ParseRecipeData(
            title: 'Test Recipe',
            ingredients: ['1 cup flour'],
            steps: ['Mix'],
            servings: 4,
          ),
        );
        expect(response.success, isTrue);
        expect(response.data, isNotNull);
        expect(response.data!.title, equals('Test Recipe'));
        expect(response.error, isNull);
        expect(response.code, isNull);
      });

      test('can be constructed for failure case', () {
        const response = ParseRecipeResponse(
          success: false,
          error: 'Parse failed',
          code: 'PARSE_FAILED',
          retryable: false,
        );
        expect(response.success, isFalse);
        expect(response.error, equals('Parse failed'));
        expect(response.code, equals('PARSE_FAILED'));
        expect(response.retryable, isFalse);
        expect(response.data, isNull);
      });
    });

    group('ParseRecipeData', () {
      test('can be constructed with all fields', () {
        const data = ParseRecipeData(
          title: 'Test Recipe',
          ingredients: ['1 cup flour', '2 eggs'],
          steps: ['Mix', 'Bake'],
          servings: 4,
          prepTime: 10,
          cookTime: 30,
        );

        expect(data.title, equals('Test Recipe'));
        expect(data.ingredients, hasLength(2));
        expect(data.steps, hasLength(2));
        expect(data.servings, equals(4));
        expect(data.prepTime, equals(10));
        expect(data.cookTime, equals(30));
      });

      test('can be constructed with only required fields', () {
        const data = ParseRecipeData(
          title: 'Test Recipe',
          ingredients: ['1 cup flour'],
          steps: ['Mix'],
        );

        expect(data.title, equals('Test Recipe'));
        expect(data.servings, isNull);
        expect(data.prepTime, isNull);
        expect(data.cookTime, isNull);
      });
    });
  });

  group('Exception types', () {
    test('RecipeNotFoundException has correct message', () {
      final exception = RecipeNotFoundException(recipeId: 'recipe-123');
      expect(exception.toString(), contains('recipe-123'));
      expect(exception.toString(), contains('RecipeNotFoundException'));
    });

    test('DatabaseException can be instantiated', () {
      const exception = DatabaseException(message: 'Test error');
      expect(exception.message, equals('Test error'));
      expect(exception.toString(), contains('DatabaseException'));
    });

    test('NetworkException can be instantiated with retryable true', () {
      const exception = NetworkException(
        message: 'Connection failed',
        retryable: true,
      );
      expect(exception.message, equals('Connection failed'));
      expect(exception.retryable, isTrue);
      expect(exception.toString(), contains('retryable: true'));
    });

    test('NetworkException can be instantiated with retryable false', () {
      const exception = NetworkException(
        message: 'Connection failed',
        retryable: false,
      );
      expect(exception.retryable, isFalse);
      expect(exception.toString(), contains('retryable: false'));
    });

    test('ValidationException can be instantiated', () {
      const exception = ValidationException(message: 'Invalid URL');
      expect(exception.message, equals('Invalid URL'));
      expect(exception.toString(), contains('ValidationException'));
    });

    test('ParseException can be instantiated with error code', () {
      const exception = ParseException(
        message: 'Parse failed',
        errorCode: ErrorCode.parseFailed,
      );
      expect(exception.message, equals('Parse failed'));
      expect(exception.errorCode, equals(ErrorCode.parseFailed));
      expect(exception.toString(), contains('ParseException'));
    });

    test('ErrorCode enum has correct values', () {
      expect(ErrorCode.values, contains(ErrorCode.invalidUrl));
      expect(ErrorCode.values, contains(ErrorCode.fetchFailed));
      expect(ErrorCode.values, contains(ErrorCode.parseFailed));
      expect(ErrorCode.values, contains(ErrorCode.rateLimit));
    });
  });

  group('Recipe model', () {
    test('Recipe can be created with required fields', () {
      final recipe = Recipe(
        id: 'test-id',
        title: 'Test Recipe',
        status: RecipeStatus.pending,
        userId: 'user-1',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      expect(recipe.id, equals('test-id'));
      expect(recipe.title, equals('Test Recipe'));
      expect(recipe.status, equals(RecipeStatus.pending));
      expect(recipe.userId, equals('user-1'));
    });

    test('Recipe can be created with all fields', () {
      final now = DateTime.now();
      final recipe = Recipe(
        id: 'test-id',
        title: 'Test Recipe',
        sourceUrl: 'https://example.com/recipe',
        description: 'A test recipe',
        prepTimeMinutes: 10,
        cookTimeMinutes: 30,
        totalTimeMinutes: 40,
        servings: 4,
        images: ['https://example.com/image.jpg'],
        cuisineType: 'Italian',
        dietaryTags: ['vegetarian'],
        status: RecipeStatus.parsed,
        parseConfidence: 0.95,
        userId: 'user-1',
        createdAt: now,
        updatedAt: now,
      );

      expect(recipe.sourceUrl, equals('https://example.com/recipe'));
      expect(recipe.description, equals('A test recipe'));
      expect(recipe.prepTimeMinutes, equals(10));
      expect(recipe.cookTimeMinutes, equals(30));
      expect(recipe.totalTimeMinutes, equals(40));
      expect(recipe.servings, equals(4));
      expect(recipe.images, hasLength(1));
      expect(recipe.cuisineType, equals('Italian'));
      expect(recipe.dietaryTags, contains('vegetarian'));
      expect(recipe.status, equals(RecipeStatus.parsed));
      expect(recipe.parseConfidence, equals(0.95));
    });

    test('Recipe.copyWith creates new instance with updated fields', () {
      final original = Recipe(
        id: 'test-id',
        title: 'Original Title',
        status: RecipeStatus.pending,
        userId: 'user-1',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      final updated = original.copyWith(
        title: 'Updated Title',
        status: RecipeStatus.parsed,
      );

      expect(updated.id, equals(original.id));
      expect(updated.title, equals('Updated Title'));
      expect(updated.status, equals(RecipeStatus.parsed));
      expect(original.title, equals('Original Title')); // Original unchanged
    });

    test('RecipeStatus enum has correct values', () {
      expect(RecipeStatus.values, contains(RecipeStatus.pending));
      expect(RecipeStatus.values, contains(RecipeStatus.parsed));
      expect(RecipeStatus.values, contains(RecipeStatus.draft));
      expect(RecipeStatus.values, contains(RecipeStatus.error));
    });

    test('Recipe.fromJson creates valid Recipe', () {
      final json = {
        'id': 'test-id',
        'title': 'Test Recipe',
        'source_url': 'https://example.com/recipe',
        'status': 'pending',
        'user_id': 'user-1',
        'created_at': DateTime.now().toIso8601String(),
        'updated_at': DateTime.now().toIso8601String(),
      };

      final recipe = Recipe.fromJson(json);

      expect(recipe.id, equals('test-id'));
      expect(recipe.title, equals('Test Recipe'));
      expect(recipe.status, equals(RecipeStatus.pending));
    });

    test('RecipeStatus parsing is a valid enum value', () {
      expect(RecipeStatus.values, contains(RecipeStatus.parsing));
      expect(RecipeStatus.parsing.toString(), equals('RecipeStatus.parsing'));
    });

    test('Recipe can have parsing status', () {
      final recipe = Recipe(
        id: 'test-id',
        title: 'Parsing...',
        status: RecipeStatus.parsing,
        userId: 'user-1',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      expect(recipe.status, equals(RecipeStatus.parsing));
    });
  });
}
