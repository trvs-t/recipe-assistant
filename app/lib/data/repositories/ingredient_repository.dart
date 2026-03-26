import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/ingredient.dart';
import 'package:app/data/repositories/i_ingredient_repository.dart';

/// Implementation of [IIngredientRepository] using Supabase.
class IngredientRepository implements IIngredientRepository {
  /// Creates an [IngredientRepository] with the given [SupabaseClient].
  IngredientRepository({required SupabaseClient client}) : _client = client;

  final SupabaseClient _client;

  @override
  Future<List<Ingredient>> getIngredients(String recipeId) async {
    try {
      final response = await _client
          .from('ingredients')
          .select()
          .eq('recipe_id', recipeId)
          .order('sort_order', ascending: true);

      return response.map((json) => Ingredient.fromJson(json)).toList();
    } on PostgrestException catch (e) {
      throw _mapPostgrestException(e);
    }
  }

  @override
  Future<Ingredient> createIngredient(Ingredient ingredient) async {
    try {
      final response = await _client
          .from('ingredients')
          .insert(ingredient.toJson())
          .select()
          .single();

      return Ingredient.fromJson(response);
    } on PostgrestException catch (e) {
      throw _mapPostgrestException(e);
    }
  }

  @override
  Future<void> deleteIngredient(String id) async {
    try {
      await _client.from('ingredients').delete().eq('id', id);
    } on PostgrestException catch (e) {
      throw _mapPostgrestException(e);
    }
  }

  /// Maps [PostgrestException] to appropriate [RecipeException] types.
  RecipeException _mapPostgrestException(PostgrestException e) {
    final code = e.code;

    if (code == null) {
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
      case 'PGRST116':
        return const DatabaseException(message: 'Query returned no results');
      case '23505':
        return DatabaseException(message: 'Duplicate entry: ${e.message}');
      case '23503':
        return DatabaseException(
          message: 'Referenced record not found: ${e.message}',
        );
      case '42501':
        return const DatabaseException(message: 'Access denied');
      case '42P01':
        return DatabaseException(
          message: 'Database schema error: ${e.message}',
        );
      case '08006':
        return const NetworkException(
          message: 'Database connection lost',
          retryable: true,
        );
      default:
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
