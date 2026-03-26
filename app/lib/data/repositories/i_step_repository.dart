import 'package:app/data/models/step.dart';

/// Repository interface for recipe step operations.
/// Abstracts data access from implementation details (Supabase, local DB).
abstract class IStepRepository {
  /// Fetch all steps for a specific recipe.
  /// Returns a list of [Step] objects sorted by [sort_order].
  Future<List<Step>> getSteps(String recipeId);

  /// Create a new step.
  /// The step's [recipeId] must reference an existing recipe.
  /// Returns the created step with generated ID.
  Future<Step> createStep(Step step);

  /// Delete a step by ID.
  /// Permanently removes the step from the database.
  /// Idempotent - safe to call multiple times.
  Future<void> deleteStep(String id);
}

/// Exception thrown when a step is not found.
class StepNotFoundException implements Exception {
  /// Creates a [StepNotFoundException] with the given [id].
  StepNotFoundException(this.id);

  /// The ID of the step that was not found.
  final String id;

  @override
  String toString() => 'StepNotFoundException: Step with id "$id" not found';
}
