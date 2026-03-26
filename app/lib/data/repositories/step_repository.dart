import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/step.dart';
import 'package:app/data/repositories/i_step_repository.dart';

/// Implementation of [IStepRepository] using Supabase.
class StepRepository implements IStepRepository {
  /// Creates a [StepRepository] with the given [SupabaseClient].
  StepRepository({required SupabaseClient client}) : _client = client;

  final SupabaseClient _client;

  @override
  Future<List<Step>> getSteps(String recipeId) async {
    try {
      final response = await _client
          .from('steps')
          .select()
          .eq('recipe_id', recipeId)
          .order('sort_order', ascending: true);

      return response.map((json) => Step.fromJson(json)).toList();
    } on PostgrestException catch (e) {
      throw _mapPostgrestException(e);
    }
  }

  @override
  Future<Step> createStep(Step step) async {
    try {
      final response = await _client
          .from('steps')
          .insert(step.toJson())
          .select()
          .single();

      return Step.fromJson(response);
    } on PostgrestException catch (e) {
      throw _mapPostgrestException(e);
    }
  }

  @override
  Future<void> deleteStep(String id) async {
    try {
      await _client.from('steps').delete().eq('id', id);
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
