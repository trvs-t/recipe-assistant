import 'package:freezed_annotation/freezed_annotation.dart';

part 'recipe.freezed.dart';
part 'recipe.g.dart';

/// Recipe model representing a saved recipe.
/// Based on domain specification section 2.2.1
@freezed
sealed class Recipe with _$Recipe {
  /// Creates a [Recipe] instance.
  const factory Recipe({
    /// Unique identifier for the recipe.
    required String id,

    /// Recipe title.
    required String title,

    /// Original source URL.
    @JsonKey(name: 'source_url') String? sourceUrl,

    /// Recipe description.
    String? description,

    /// Prep time in minutes.
    @JsonKey(name: 'prep_time_minutes') int? prepTimeMinutes,

    /// Cook time in minutes.
    @JsonKey(name: 'cook_time_minutes') int? cookTimeMinutes,

    /// Total time in minutes.
    @JsonKey(name: 'total_time_minutes') int? totalTimeMinutes,

    /// Number of servings the recipe yields.
    int? servings,

    /// List of image URLs.
    @Default([]) List<String> images,

    /// Cuisine type (e.g., 'Italian', 'Mexican').
    @JsonKey(name: 'cuisine_type') String? cuisineType,

    /// Dietary tags (e.g., 'vegetarian', 'gluten-free').
    @JsonKey(name: 'dietary_tags') @Default([]) List<String> dietaryTags,

    /// Recipe status: pending, parsed, draft, error.
    required RecipeStatus status,

    /// AI confidence score for parsing (0-1).
    @JsonKey(name: 'parse_confidence') double? parseConfidence,

    /// User ID who owns this recipe.
    @JsonKey(name: 'user_id') required String userId,

    /// Creation timestamp.
    @JsonKey(name: 'created_at') required DateTime createdAt,

    /// Last update timestamp.
    @JsonKey(name: 'updated_at') required DateTime updatedAt,
  }) = _Recipe;

  /// Creates a [Recipe] from JSON.
  factory Recipe.fromJson(Map<String, Object?> json) => _$RecipeFromJson(json);
}

/// Recipe status values.
enum RecipeStatus {
  /// Recipe saved, waiting for validation.
  pending,

  /// Recipe successfully parsed and ready.
  parsed,

  /// URL invalid or low confidence, can edit manually.
  draft,

  /// Parse failed.
  error,
}
