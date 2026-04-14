import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:app/data/models/recipe.dart';
import 'package:app/presentation/providers/providers.dart';

part 'recipe_detail_provider.g.dart';

/// Disables retry for recipe detail fetches since 404 is a valid "not found" state.
Duration? _noRetry(int retryCount, Object error) => null;

/// Fetches a recipe by ID.
///
/// Returns an [AsyncValue<Recipe>] that handles loading, error, and data states.
/// Retry is disabled since "not found" is a valid end state, not a transient error.
@Riverpod(retry: _noRetry)
class RecipeDetail extends _$RecipeDetail {
  @override
  Future<Recipe> build(String id) async {
    final repository = ref.watch(recipeRepositoryProvider);
    return repository.getRecipe(id);
  }
}

/// Provider for the current scale factor when scaling a recipe.
///
/// This is transient UI state - it is not persisted.
/// Default value is 1.0 (no scaling).
///
/// Usage:
/// ```dart
/// // Read current scale factor
/// final factor = ref.watch(scaleFactorProvider);
/// ```
@riverpod
class ScaleFactor extends _$ScaleFactor {
  @override
  double build() => 1.0;
}

/// Computed provider that returns a scaled version of the recipe.
///
/// This provider watches both the [RecipeDetail] stream and the [scaleFactorProvider].
/// It calculates the scaled servings based on the original recipe servings and
/// the current scale factor.
///
/// The scaling formula is:
/// ```dart
/// scaled_servings = original_servings * scale_factor
/// ```
///
/// Returns [AsyncValue<ScaledRecipe>] to handle loading/error states.
@riverpod
class ScaledRecipe extends _$ScaledRecipe {
  @override
  AsyncValue<ScaledRecipeData> build(String id) {
    final recipeAsync = ref.watch(recipeDetailProvider(id));
    final scaleFactor = ref.watch(scaleFactorProvider);

    return recipeAsync.whenData((recipe) {
      final originalServings = recipe.servings ?? 1;
      final scaledServings = (originalServings * scaleFactor).round();

      return ScaledRecipeData(
        recipe: recipe,
        scaleFactor: scaleFactor,
        originalServings: originalServings,
        scaledServings: scaledServings,
      );
    });
  }
}

/// Data class holding a recipe with its scaling information.
class ScaledRecipeData {
  const ScaledRecipeData({
    required this.recipe,
    required this.scaleFactor,
    required this.originalServings,
    required this.scaledServings,
  });

  /// The original recipe.
  final Recipe recipe;

  /// The scale factor applied (e.g., 1.5 for 50% more).
  final double scaleFactor;

  /// Original number of servings from the recipe.
  final int originalServings;

  /// Computed number of servings after scaling.
  final int scaledServings;

  /// Convenience getter to check if scaling is applied.
  bool get isScaled => scaleFactor != 1.0;
}
