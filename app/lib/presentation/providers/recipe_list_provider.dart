import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/presentation/providers/providers.dart';

part 'recipe_list_provider.g.dart';

/// Provider for the list of recipes.
///
/// Uses Riverpod code generation to provide reactive recipe list state
/// with automatic loading, error, and data handling via AsyncValue.
@riverpod
class RecipeList extends _$RecipeList {
  @override
  Future<List<Recipe>> build() async {
    return _fetchRecipes();
  }

  /// Fetches recipes from the repository.
  ///
  /// Throws [RecipeNotFoundException] if no recipes are found.
  /// Throws [NetworkException] if a network error occurs.
  Future<List<Recipe>> _fetchRecipes() async {
    final repository = ref.read(recipeRepositoryProvider);
    return repository.getRecipes();
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
