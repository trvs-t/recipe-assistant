import 'package:app/data/models/ingredient.dart';

/// Repository interface for ingredient operations.
/// Abstracts data access from implementation details (Supabase, local DB).
abstract class IIngredientRepository {
  /// Fetch all ingredients for a specific recipe.
  /// Returns a list of [Ingredient] objects sorted by [sort_order].
  Future<List<Ingredient>> getIngredients(String recipeId);

  /// Create a new ingredient.
  /// The ingredient's [recipeId] must reference an existing recipe.
  /// Returns the created ingredient with generated ID.
  Future<Ingredient> createIngredient(Ingredient ingredient);

  /// Delete an ingredient by ID.
  /// Permanently removes the ingredient from the database.
  /// Idempotent - safe to call multiple times.
  Future<void> deleteIngredient(String id);
}

/// Exception thrown when an ingredient is not found.
class IngredientNotFoundException implements Exception {
  /// Creates an [IngredientNotFoundException] with the given [id].
  IngredientNotFoundException(this.id);

  /// The ID of the ingredient that was not found.
  final String id;

  @override
  String toString() =>
      'IngredientNotFoundException: Ingredient with id "$id" not found';
}
