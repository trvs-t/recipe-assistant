import 'package:freezed_annotation/freezed_annotation.dart';

part 'ingredient_input.freezed.dart';
part 'ingredient_input.g.dart';

/// Input DTO for a manually entered ingredient.
/// Used when creating or editing a recipe manually.
@freezed
sealed class IngredientInput with _$IngredientInput {
  /// Creates an [IngredientInput] instance.
  const factory IngredientInput({
    /// Parsed quantity (e.g., 2.0).
    double? quantity,

    /// Normalized unit (e.g., 'cup', 'tbsp', 'g').
    String? unit,

    /// Normalized ingredient name (e.g., 'flour').
    required String name,

    /// Additional notes (e.g., "softened", "diced").
    String? notes,
  }) = _IngredientInput;

  /// Creates an [IngredientInput] from JSON.
  factory IngredientInput.fromJson(Map<String, Object?> json) =>
      _$IngredientInputFromJson(json);
}
