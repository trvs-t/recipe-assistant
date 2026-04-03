import 'dart:async';

import 'package:app/data/models/recipe.dart';

/// Repository interface for recipe operations.
/// Abstracts data access from implementation details (Supabase, local DB).
abstract class IRecipeRepository {
  /// Fetch all recipes for the current user.
  /// Returns a list of [Recipe] objects sorted by creation date (newest first).
  Future<List<Recipe>> getRecipes();

  /// Fetch a single recipe by its ID.
  /// Throws [RecipeNotFoundException] if recipe doesn't exist or user lacks access.
  Future<Recipe> getRecipe(String id);

  /// Create a new recipe from a URL.
  /// Initiates async parsing workflow and returns the created recipe
  /// with status set to 'pending'.
  Future<Recipe> createRecipe(String url);

  /// Create a new recipe from plain text input.
  /// Use this when the user pastes recipe content directly instead of a URL.
  /// Initiates async parsing workflow and returns the created recipe
  /// with status set to 'pending'.
  Future<Recipe> createRecipeFromText(String text);

  /// Watch a recipe for real-time updates.
  /// Emits updates when recipe data changes (e.g., parsing completes).
  Stream<Recipe> watchRecipe(String id);

  /// Soft delete a recipe by ID.
  /// Marks recipe as deleted without removing from database.
  /// Idempotent - safe to call multiple times.
  Future<void> deleteRecipe(String id);
}

/// Exception thrown when a recipe is not found.
class RecipeNotFoundException implements Exception {
  /// Creates a [RecipeNotFoundException] with the given [id].
  RecipeNotFoundException(this.id);

  /// The ID of the recipe that was not found.
  final String id;

  @override
  String toString() =>
      'RecipeNotFoundException: Recipe with id "$id" not found';
}
