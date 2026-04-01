import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'app.dart';
import 'data/repositories/ingredient_repository.dart';
import 'data/repositories/recipe_repository.dart';
import 'data/repositories/step_repository.dart';
import 'data/services/supabase_client.dart';
import 'presentation/providers/detail_providers.dart';
import 'presentation/providers/providers.dart';

Future<void> main() async {
  // Load environment variables from .env file
  await dotenv.load(fileName: '.env');

  // Initialize Supabase client
  await SupabaseInitializer.initialize();

  runApp(
    ProviderScope(
      overrides: [
        // Override IRecipeRepository with concrete implementation
        recipeRepositoryProvider.overrideWith(
          (ref) => RecipeRepository(client: ref.watch(supabaseClientProvider)),
        ),
        // Override IIngredientRepository with concrete implementation
        ingredientRepositoryProvider.overrideWith(
          (ref) =>
              IngredientRepository(client: ref.watch(supabaseClientProvider)),
        ),
        // Override IStepRepository with concrete implementation
        stepRepositoryProvider.overrideWith(
          (ref) => StepRepository(client: ref.watch(supabaseClientProvider)),
        ),
      ],
      child: const MyApp(),
    ),
  );
}
