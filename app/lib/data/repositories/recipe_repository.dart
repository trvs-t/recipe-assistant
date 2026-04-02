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

  /// Dev user ID from seed data - used when auth is not configured.
  /// This allows development without email/password auth.
  static const String _devUserId = '00000000-0000-0000-0000-000000000001';

  /// Returns the current user ID, or the dev user ID if not authenticated.
  /// This enables development without auth while still working with RLS.
  String _getUserId() {
    return _client.auth.currentUser?.id ?? _devUserId;
  }

  @override
  Future<List<Recipe>> getRecipes() async {
    try {
      final response = await _client
          .from('recipes')
          .select()
          .eq('user_id', _getUserId())
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
          .eq('user_id', _getUserId())
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
    try {
      // Call import-recipe Edge Function
      final response = await _client.functions.invoke(
        'import-recipe',
        body: {'url': url},
      );

      // Handle 400 Bad Request (validation error)
      if (response.status == 400) {
        final error = response.data['error'] as String? ?? 'Invalid URL';
        if (error == 'PAYWALL') {
          throw const ValidationException(
            message: 'This recipe is behind a paywall',
          );
        }
        throw ValidationException(message: 'Invalid URL: $error');
      }

      // Handle 500 Server Error
      if (response.status == 500) {
        throw const NetworkException(
          message: 'Server error during recipe import',
          retryable: true,
        );
      }

      // Handle unexpected status codes
      if (response.status != 202) {
        throw NetworkException(
          message: 'Unexpected response status: ${response.status}',
          retryable: true,
        );
      }

      // Extract recipe_id from 202 response
      final data = response.data as Map<String, dynamic>;
      final recipeId = data['recipe_id'] as String?;

      if (recipeId == null || recipeId.isEmpty) {
        throw const ParseException(
          message: 'Invalid response: missing recipe_id',
          errorCode: ErrorCode.parseFailed,
        );
      }

      // Subscribe to recipe changes via watchRecipe
      final recipeStream = watchRecipe(recipeId);

      // Wait for processing to complete (status != pending && != parsing)
      final recipe = await recipeStream.firstWhere(
        (recipe) =>
            recipe.status != RecipeStatus.pending &&
            recipe.status != RecipeStatus.parsing,
      );

      // Check for error status
      if (recipe.status == RecipeStatus.error) {
        throw const ParseException(
          message: 'Failed to parse recipe',
          errorCode: ErrorCode.parseFailed,
        );
      }

      return recipe;
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
          .eq('user_id', _getUserId())
          .select();

      // If no rows were updated, recipe doesn't exist or user lacks access
      if (response.isEmpty) {
        throw RecipeNotFoundException(recipeId: id);
      }
    } on PostgrestException catch (e) {
      throw _mapPostgrestException(e);
    }
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
