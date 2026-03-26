import 'package:app/data/models/ingredient.dart';
import 'package:app/data/models/recipe.dart';

/// Exception thrown when scaling fails due to invalid input.
class ScalingException implements Exception {
  /// Creates a [ScalingException] with the given message.
  const ScalingException(this.message);

  /// The error message describing what went wrong.
  final String message;

  @override
  String toString() => 'ScalingException: $message';
}

/// Result of scaling a recipe containing the scaled recipe and ingredients.
class ScaledRecipeResult {
  /// Creates a [ScaledRecipeResult] instance.
  const ScaledRecipeResult({
    required this.recipe,
    required this.ingredients,
    this.wasCapped = false,
    this.originalScaleFactor = 1.0,
  });

  /// The scaled recipe with updated servings.
  final Recipe recipe;

  /// The list of scaled ingredients.
  final List<Ingredient> ingredients;

  /// Whether the scale factor was capped at the maximum.
  final bool wasCapped;

  /// The original scale factor before capping.
  final double originalScaleFactor;
}

/// Service for scaling recipe ingredients based on desired servings.
///
/// The scaling formula is:
/// ```
/// scaleFactor = desiredServings / originalServings
/// scaledQuantity = originalQuantity × scaleFactor
/// ```
class RecipeScaleService {
  /// Maximum allowed scale factor to prevent unrealistic quantities.
  static const double maxScaleFactor = 10.0;

  /// Scale a recipe's ingredients to the desired number of servings.
  ///
  /// Parameters:
  /// - [recipe]: The original recipe with servings information
  /// - [ingredients]: The list of ingredients to scale
  /// - [desiredServings]: The target number of servings
  ///
  /// Returns a [ScaledRecipeResult] containing:
  /// - A new Recipe with updated servings
  /// - A list of new Ingredient instances with scaled quantities
  ///
  /// Throws [ScalingException] if:
  /// - [desiredServings] is less than or equal to 0
  /// - The original recipe has no servings specified
  /// - The original recipe has servings equal to 0
  ///
  /// If the calculated scale factor exceeds [maxScaleFactor], it will be
  /// capped and [ScaledRecipeResult.wasCapped] will be true.
  ScaledRecipeResult scale({
    required Recipe recipe,
    required List<Ingredient> ingredients,
    required int desiredServings,
  }) {
    // Validate desired servings
    if (desiredServings <= 0) {
      throw const ScalingException('Desired servings must be greater than 0');
    }

    // Validate original servings
    final originalServings = recipe.servings;
    if (originalServings == null) {
      throw const ScalingException(
        'Original recipe must have servings specified',
      );
    }
    if (originalServings <= 0) {
      throw const ScalingException(
        'Original recipe servings must be greater than 0',
      );
    }

    // Calculate scale factor
    var scaleFactor = desiredServings / originalServings;
    final originalScaleFactor = scaleFactor;
    var wasCapped = false;

    // Cap scale factor if it exceeds maximum
    if (scaleFactor > maxScaleFactor) {
      scaleFactor = maxScaleFactor;
      wasCapped = true;
    }

    // Scale ingredients
    final scaledIngredients = ingredients.map((ingredient) {
      final originalQuantity = ingredient.quantity;
      final scaledQuantity = originalQuantity != null
          ? _roundQuantity(originalQuantity * scaleFactor)
          : null;

      return ingredient.copyWith(quantity: scaledQuantity);
    }).toList();

    // Create scaled recipe (only servings changes)
    final scaledRecipe = recipe.copyWith(servings: desiredServings);

    return ScaledRecipeResult(
      recipe: scaledRecipe,
      ingredients: scaledIngredients,
      wasCapped: wasCapped,
      originalScaleFactor: originalScaleFactor,
    );
  }

  /// Round a scaled quantity to appropriate precision.
  ///
  /// For quantities:
  /// - Less than 1: round to 2 decimal places (e.g., 0.333 → 0.33)
  /// - Between 1 and 10: round to 1 decimal place (e.g., 2.25 → 2.3)
  /// - 10 or greater: round to whole number (e.g., 12.7 → 13)
  double _roundQuantity(double quantity) {
    if (quantity < 1) {
      // Round to 2 decimal places for small quantities
      return (quantity * 100).round() / 100;
    } else if (quantity < 10) {
      // Round to 1 decimal place for medium quantities
      return (quantity * 10).round() / 10;
    } else {
      // Round to whole number for large quantities
      return quantity.round().toDouble();
    }
  }
}
