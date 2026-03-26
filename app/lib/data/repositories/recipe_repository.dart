import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart'
    hide RecipeNotFoundException;

/// Response from the validate-url Edge Function.
class ValidateUrlResponse {
  const ValidateUrlResponse({required this.valid, this.reason, this.retryable});

  final bool valid;
  final String? reason;
  final bool? retryable;
}

/// Response from the parse-recipe Edge Function.
class ParseRecipeResponse {
  const ParseRecipeResponse({
    required this.success,
    this.error,
    this.code,
    this.retryable,
    this.data,
  });

  final bool success;
  final String? error;
  final String? code;
  final bool? retryable;
  final ParseRecipeData? data;
}

/// Parsed recipe data from the parse-recipe Edge Function.
class ParseRecipeData {
  const ParseRecipeData({
    required this.title,
    required this.ingredients,
    required this.steps,
    this.servings,
    this.prepTime,
    this.cookTime,
  });

  final String title;
  final List<String> ingredients;
  final List<String> steps;
  final int? servings;
  final int? prepTime;
  final int? cookTime;
}

/// Implementation of [IRecipeRepository] using Supabase.
///
/// This repository provides online-only access to recipes via Supabase.
/// For offline-first access, use a local-first implementation.
class RecipeRepository implements IRecipeRepository {
  /// Creates a [RecipeRepository] with the given [SupabaseClient].
  RecipeRepository({required SupabaseClient client}) : _client = client;

  final SupabaseClient _client;

  // Retry configuration for exponential backoff
  static const int _maxRetries = 3;
  static const Duration _initialBackoff = Duration(milliseconds: 500);

  @override
  Future<List<Recipe>> getRecipes() async {
    try {
      final response = await _client
          .from('recipes')
          .select()
          .eq('user_id', _client.auth.currentUser!.id)
          .neq('status', 'deleted') // Exclude soft-deleted recipes
          .order('created_at', ascending: false);

      return response.map((json) => Recipe.fromJson(json)).toList();
    } on PostgrestException catch (e) {
      throw _mapPostgrestException(e);
    }
  }

  @override
  Future<Recipe> getRecipe(String id) async {
    try {
      final response = await _client
          .from('recipes')
          .select()
          .eq('id', id)
          .eq('user_id', _client.auth.currentUser!.id)
          .maybeSingle();

      if (response == null) {
        throw RecipeNotFoundException(recipeId: id);
      }

      return Recipe.fromJson(response);
    } on PostgrestException catch (e) {
      throw _mapPostgrestException(e);
    }
  }

  @override
  Future<Recipe> createRecipe(String url) async {
    final userId = _client.auth.currentUser!.id;

    // Step 1: Create pending recipe entry first
    final pendingRecipe = Recipe(
      id: '', // Will be set by Supabase
      title: 'Parsing...',
      sourceUrl: url,
      status: RecipeStatus.pending,
      userId: userId,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    try {
      // Insert pending recipe
      final insertResponse = await _client
          .from('recipes')
          .insert(pendingRecipe.toJson())
          .select()
          .single();

      final createdRecipe = Recipe.fromJson(insertResponse);
      final recipeId = createdRecipe.id;

      // Step 2: Call validate-url Edge Function
      final validation = await _retryableOperation(() => _callValidateUrl(url));

      if (!validation.valid) {
        // Update recipe status to draft if validation fails
        await _client
            .from('recipes')
            .update({
              'status': 'draft',
              'updated_at': DateTime.now().toIso8601String(),
            })
            .eq('id', recipeId);

        final reason = validation.reason ?? 'Unknown validation failure';
        throw ValidationException(message: 'URL validation failed: $reason');
      }

      // Step 3: Call parse-recipe Edge Function
      final parseResult = await _retryableOperation(
        () => _callParseRecipe(recipeId, url),
      );

      if (!parseResult.success) {
        // Update recipe status to error if parsing fails
        await _client
            .from('recipes')
            .update({
              'status': 'error',
              'updated_at': DateTime.now().toIso8601String(),
            })
            .eq('id', recipeId);

        final error = parseResult.error ?? 'Unknown parse failure';
        throw ParseException(message: error, errorCode: ErrorCode.parseFailed);
      }

      // Step 4: Parse succeeded, update recipe with parsed data
      final data = parseResult.data;
      if (data == null) {
        throw const ParseException(
          message: 'Parse succeeded but no data returned',
          errorCode: ErrorCode.parseFailed,
        );
      }

      final updatedRecipe = createdRecipe.copyWith(
        title: data.title,
        description: 'Imported from $url',
        servings: data.servings,
        prepTimeMinutes: data.prepTime,
        cookTimeMinutes: data.cookTime,
        totalTimeMinutes: (data.prepTime ?? 0) + (data.cookTime ?? 0),
        status: RecipeStatus.parsed,
        updatedAt: DateTime.now(),
      );

      await _client
          .from('recipes')
          .update(updatedRecipe.toJson())
          .eq('id', recipeId);

      // Step 5: Insert ingredients
      for (var i = 0; i < data.ingredients.length; i++) {
        await _client.from('ingredients').insert({
          'recipe_id': recipeId,
          'original_text': data.ingredients[i],
          'name': data.ingredients[i], // Will be parsed separately if needed
          'sort_order': i,
        });
      }

      // Step 6: Insert steps
      for (var i = 0; i < data.steps.length; i++) {
        await _client.from('steps').insert({
          'recipe_id': recipeId,
          'instruction': data.steps[i],
          'sort_order': i,
        });
      }

      return updatedRecipe;
    } on PostgrestException catch (e) {
      throw _mapPostgrestException(e);
    }
  }

  @override
  Stream<Recipe> watchRecipe(String id) {
    // Use Supabase Realtime to watch for changes on this recipe
    final controller = StreamController<Recipe>();

    // Set up realtime subscription
    final channel = _client
        .channel('recipe-$id')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'recipes',
          filter: PostgresChangeFilter(
            column: 'id',
            type: PostgresChangeFilterType.eq,
            value: id,
          ),
          callback: (payload) async {
            // Fetch the latest recipe data after change
            try {
              final response = await _client
                  .from('recipes')
                  .select()
                  .eq('id', id)
                  .maybeSingle();

              if (response != null) {
                controller.add(Recipe.fromJson(response));
              }
            } catch (_) {
              // Recipe may have been deleted
              controller.addError(RecipeNotFoundException(recipeId: id));
            }
          },
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.delete,
          schema: 'public',
          table: 'recipes',
          filter: PostgresChangeFilter(
            column: 'id',
            type: PostgresChangeFilterType.eq,
            value: id,
          ),
          callback: (payload) {
            controller.addError(RecipeNotFoundException(recipeId: id));
          },
        );

    // Subscribe to the channel
    channel.subscribe();

    // Clean up when stream is cancelled
    controller.onCancel = () {
      channel.unsubscribe();
    };

    return controller.stream;
  }

  @override
  Future<void> deleteRecipe(String id) async {
    try {
      // Soft delete by setting status to 'deleted'
      final response = await _client
          .from('recipes')
          .update({
            'status': 'deleted',
            'updated_at': DateTime.now().toIso8601String(),
          })
          .eq('id', id)
          .eq('user_id', _client.auth.currentUser!.id)
          .select();

      // If no rows were updated, recipe doesn't exist or user lacks access
      if (response.isEmpty) {
        throw RecipeNotFoundException(recipeId: id);
      }
    } on PostgrestException catch (e) {
      throw _mapPostgrestException(e);
    }
  }

  /// Calls the validate-url Edge Function.
  Future<ValidateUrlResponse> _callValidateUrl(String url) async {
    final response = await _client.functions.invoke(
      'validate-url',
      body: {'url': url},
    );

    if (response.data == null) {
      return const ValidateUrlResponse(
        valid: false,
        reason: 'No response from validation',
        retryable: true,
      );
    }

    final data = response.data as Map<String, dynamic>;
    return ValidateUrlResponse(
      valid: data['valid'] as bool? ?? false,
      reason: data['reason'] as String?,
      retryable: data['retryable'] as bool?,
    );
  }

  /// Calls the parse-recipe Edge Function.
  Future<ParseRecipeResponse> _callParseRecipe(
    String recipeId,
    String url,
  ) async {
    final response = await _client.functions.invoke(
      'parse-recipe',
      body: {'recipe_id': recipeId, 'url': url},
    );

    if (response.data == null) {
      return const ParseRecipeResponse(
        success: false,
        error: 'No response from parser',
        code: 'PARSE_FAILED',
        retryable: true,
      );
    }

    final data = response.data as Map<String, dynamic>;
    final success = data['success'] as bool? ?? false;

    if (!success) {
      return ParseRecipeResponse(
        success: false,
        error: data['error'] as String?,
        code: data['code'] as String?,
        retryable: data['retryable'] as bool?,
      );
    }

    // Parse successful response
    final recipeData = data['data'] as Map<String, dynamic>?;
    if (recipeData == null) {
      return const ParseRecipeResponse(
        success: false,
        error: 'No data in successful response',
        code: 'PARSE_FAILED',
        retryable: false,
      );
    }

    return ParseRecipeResponse(
      success: true,
      data: ParseRecipeData(
        title: recipeData['title'] as String,
        ingredients: (recipeData['ingredients'] as List).cast<String>(),
        steps: (recipeData['steps'] as List).cast<String>(),
        servings: recipeData['servings'] as int?,
        prepTime: recipeData['prep_time'] as int?,
        cookTime: recipeData['cook_time'] as int?,
      ),
    );
  }

  /// Executes an operation with exponential backoff for retryable network errors.
  Future<T> _retryableOperation<T>(Future<T> Function() operation) async {
    RecipeException? lastException;

    for (var attempt = 0; attempt <= _maxRetries; attempt++) {
      try {
        return await operation();
      } on NetworkException catch (e) {
        lastException = e;

        if (!e.retryable || attempt >= _maxRetries) {
          rethrow;
        }

        // Exponential backoff: 500ms, 1000ms, 2000ms, etc.
        final delay = _initialBackoff * (1 << attempt);
        await Future.delayed(delay);
      } catch (e) {
        // Non-retryable error, rethrow immediately
        rethrow;
      }
    }

    throw lastException ??
        const NetworkException(
          message: 'Operation failed after retries',
          retryable: true,
        );
  }

  /// Maps [PostgrestException] to appropriate [RecipeException] types.
  RecipeException _mapPostgrestException(PostgrestException e) {
    final code = e.code;

    if (code == null) {
      // Connection errors
      if (e.message.contains('SocketException') ||
          e.message.contains('Connection refused') ||
          e.message.contains('timeout')) {
        return const NetworkException(
          message: 'Network connection failed',
          retryable: true,
        );
      }
      return DatabaseException(message: 'Database error: ${e.message}');
    }

    switch (code) {
      case 'PGRST116': // No rows found
        return const DatabaseException(message: 'Query returned no results');

      case '23505': // Unique violation
        return DatabaseException(message: 'Duplicate entry: ${e.message}');

      case '23503': // Foreign key violation
        return DatabaseException(
          message: 'Referenced record not found: ${e.message}',
        );

      case '42501': // Row-level security violation
        return const DatabaseException(message: 'Access denied');

      case '42P01': // Undefined table
        return DatabaseException(
          message: 'Database schema error: ${e.message}',
        );

      case '08006': // Connection exception
        return const NetworkException(
          message: 'Database connection lost',
          retryable: true,
        );

      default:
        // Check if it's a retryable network error based on message
        if (e.message.contains('connection') ||
            e.message.contains('timeout') ||
            e.message.contains('network')) {
          return NetworkException(
            message: 'Network error: ${e.message}',
            retryable: true,
          );
        }
        return DatabaseException(message: 'Database error: ${e.message}');
    }
  }
}
