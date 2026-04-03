import 'package:freezed_annotation/freezed_annotation.dart';

import 'ingredient_input.dart';

part 'manual_recipe_input.freezed.dart';
part 'manual_recipe_input.g.dart';

/// Input DTO for manually creating a recipe.
/// Used when user creates a recipe from scratch.
@freezed
sealed class ManualRecipeInput with _$ManualRecipeInput {
  /// Creates a [ManualRecipeInput] instance.
  const factory ManualRecipeInput({
    /// Recipe title.
    required String title,

    /// List of ingredients.
    @Default([]) List<IngredientInput> ingredients,

    /// List of instruction steps.
    @Default([]) List<String> instructions,
  }) = _ManualRecipeInput;

  /// Creates a [ManualRecipeInput] from JSON.
  factory ManualRecipeInput.fromJson(Map<String, Object?> json) =>
      _$ManualRecipeInputFromJson(json);
}
