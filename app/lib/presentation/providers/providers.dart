import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart';
import 'package:app/data/repositories/recipe_repository.dart';
import 'package:app/data/services/supabase_client.dart';

part 'providers.g.dart';

/// Recipe repository provider.
///
/// Returns an instance of [RecipeRepository] initialized with the Supabase client.
@riverpod
IRecipeRepository recipeRepository(Ref ref) {
  final client = ref.watch(supabaseClientProvider);
  return RecipeRepository(client: client);
}

/// Recipe list provider.
///
/// Fetches all recipes for the current user.
@riverpod
class RecipeList extends _$RecipeList {
  @override
  Future<List<Recipe>> build() async {
    return ref.watch(recipeRepositoryProvider).getRecipes();
  }
}
