import 'package:freezed_annotation/freezed_annotation.dart';

part 'step.freezed.dart';
part 'step.g.dart';

/// Step model representing a recipe instruction step.
/// Based on domain specification section 2.2.1
@freezed
sealed class Step with _$Step {
  /// Creates a [Step] instance.
  const factory Step({
    /// Unique identifier for the step.
    required String id,

    /// ID of the recipe this step belongs to.
    @JsonKey(name: 'recipe_id') required String recipeId,

    /// Step instruction text.
    required String instruction,

    /// Optional timer duration in minutes.
    int? timerMinutes,

    /// Display order within the recipe.
    required int sortOrder,

    /// Creation timestamp.
    @JsonKey(name: 'created_at') DateTime? createdAt,
  }) = _Step;

  /// Creates a [Step] from JSON.
  factory Step.fromJson(Map<String, Object?> json) => _$StepFromJson(json);
}
