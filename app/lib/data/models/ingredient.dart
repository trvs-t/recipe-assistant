import 'package:freezed_annotation/freezed_annotation.dart';

part 'ingredient.freezed.dart';
part 'ingredient.g.dart';

/// Ingredient model representing a recipe ingredient.
/// Based on domain specification section 2.2.1
@freezed
sealed class Ingredient with _$Ingredient {
  /// Creates an [Ingredient] instance.
  const factory Ingredient({
    /// Unique identifier for the ingredient.
    required String id,

    /// ID of the recipe this ingredient belongs to.
    @JsonKey(name: 'recipe_id') required String recipeId,

    /// Creation timestamp.
    @JsonKey(name: 'created_at') DateTime? createdAt,

    /// Raw text from source (e.g., "2 cups flour, sifted").
    required String originalText,

    /// Parsed quantity (e.g., 2.0).
    double? quantity,

    /// Normalized unit (e.g., 'cup', 'tbsp', 'g').
    String? unit,

    /// Normalized ingredient name (e.g., 'flour').
    required String name,

    /// Additional notes (e.g., "softened", "diced").
    String? notes,

    /// Display order within the recipe.
    required int sortOrder,
  }) = _Ingredient;

  /// Creates an [Ingredient] from JSON.
  factory Ingredient.fromJson(Map<String, Object?> json) =>
      _$IngredientFromJson(json);
}
