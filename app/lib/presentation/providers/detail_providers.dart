import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:app/data/models/ingredient.dart';
import 'package:app/data/models/step.dart';
import 'package:app/data/repositories/i_ingredient_repository.dart';
import 'package:app/data/repositories/i_step_repository.dart';
import 'package:app/data/repositories/ingredient_repository.dart';
import 'package:app/data/repositories/step_repository.dart';
import 'package:app/data/services/supabase_client.dart';

part 'detail_providers.g.dart';

/// Ingredient repository provider.
@riverpod
IIngredientRepository ingredientRepository(Ref ref) {
  final client = ref.watch(supabaseClientProvider);
  return IngredientRepository(client: client);
}

/// Step repository provider.
@riverpod
IStepRepository stepRepository(Ref ref) {
  final client = ref.watch(supabaseClientProvider);
  return StepRepository(client: client);
}

/// Provider for fetching ingredients for a specific recipe.
@riverpod
class RecipeIngredients extends _$RecipeIngredients {
  @override
  Future<List<Ingredient>> build(String recipeId) async {
    return ref.watch(ingredientRepositoryProvider).getIngredients(recipeId);
  }
}

/// Provider for fetching steps for a specific recipe.
@riverpod
class RecipeSteps extends _$RecipeSteps {
  @override
  Future<List<Step>> build(String recipeId) async {
    return ref.watch(stepRepositoryProvider).getSteps(recipeId);
  }
}
