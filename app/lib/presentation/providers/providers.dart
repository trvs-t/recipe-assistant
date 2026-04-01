import 'package:riverpod_annotation/riverpod_annotation.dart';

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
