import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/services/supabase_client.dart';
import 'package:app/presentation/providers/providers.dart';

part 'recipe_list_provider.g.dart';

/// Provider for the list of recipes.
///
/// Uses Riverpod code generation to provide reactive recipe list state
/// with automatic loading, error, and data handling via AsyncValue.
///
/// Subscribes to Supabase Realtime for automatic updates when recipes change.
@riverpod
class RecipeList extends _$RecipeList {
  @override
  Future<List<Recipe>> build() async {
    // Initial fetch of recipes
    final recipes = await _fetchRecipes();

    // Set up Supabase Realtime subscription for recipe changes
    _setupRealtimeSubscription();

    return recipes;
  }

  /// Fetches recipes from the repository.
  ///
  /// Throws [RecipeNotFoundException] if no recipes are found.
  /// Throws [NetworkException] if a network error occurs.
  Future<List<Recipe>> _fetchRecipes() async {
    final repository = ref.read(recipeRepositoryProvider);
    return repository.getRecipes();
  }

  /// Sets up the realtime subscription for recipe changes.
  void _setupRealtimeSubscription() {
    try {
      final supabase = ref.read(supabaseClientProvider);
      final userId = supabase.auth.currentUser?.id;

      // Don't set up subscription if no user is logged in
      if (userId == null) return;

      // Create a realtime channel to listen for recipe changes
      final channel = supabase
          .channel('recipe_list')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'recipes',
            filter: PostgresChangeFilter(
              column: 'user_id',
              type: PostgresChangeFilterType.eq,
              value: userId,
            ),
            callback: (payload) {
              // Handle different event types
              switch (payload.eventType) {
                case PostgresChangeEvent.insert:
                  _handleInsert(payload.newRecord);
                  break;
                case PostgresChangeEvent.update:
                  _handleUpdate(payload.newRecord);
                  break;
                case PostgresChangeEvent.delete:
                  _handleDelete(payload.oldRecord);
                  break;
                case PostgresChangeEvent.all:
                  // This case shouldn't occur in callbacks, but handle exhaustively
                  break;
              }
            },
          )
          .subscribe();

      // Clean up subscription when provider is disposed
      ref.onDispose(() {
        channel.unsubscribe();
      });
    } catch (_) {
      // Supabase not initialized (e.g., in tests), skip realtime subscription
    }
  }

  /// Handles INSERT events from the realtime subscription.
  void _handleInsert(Map<String, dynamic> record) {
    final newRecipe = Recipe.fromJson(record);
    final currentRecipes = state.value ?? [];
    state = AsyncValue.data([...currentRecipes, newRecipe]);
  }

  /// Handles UPDATE events from the realtime subscription.
  void _handleUpdate(Map<String, dynamic> record) {
    final updatedRecipe = Recipe.fromJson(record);
    final currentRecipes = state.value ?? [];
    final index = currentRecipes.indexWhere((r) => r.id == updatedRecipe.id);
    if (index != -1) {
      final newList = [...currentRecipes];
      newList[index] = updatedRecipe;
      state = AsyncValue.data(newList);
    }
  }

  /// Handles DELETE events from the realtime subscription.
  void _handleDelete(Map<String, dynamic> record) {
    final deletedId = record['id'] as String?;
    if (deletedId == null) return;

    final currentRecipes = state.value ?? [];
    state = AsyncValue.data(
      currentRecipes.where((r) => r.id != deletedId).toList(),
    );
  }

  /// Refreshes the recipe list by re-fetching from the repository.
  ///
  /// Invalidates the current state and triggers a new fetch.
  /// Use this to manually refresh the list (e.g., after creating a recipe).
  Future<void> refreshRecipes() async {
    // Invalidate the current state, triggering a rebuild with fresh data
    ref.invalidateSelf();
    // Wait for the invalidation to complete
    await future;
  }
}
