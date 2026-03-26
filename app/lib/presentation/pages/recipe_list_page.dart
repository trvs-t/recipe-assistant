import 'package:flutter/material.dart';
import '../../config/router.dart';

/// Home page displaying list of recipes
class RecipeListPage extends StatelessWidget {
  /// Creates a new recipe list page
  const RecipeListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Recipes')),
      body: const Center(child: Text('Recipe List - Coming Soon')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.goAddRecipe(),
        child: const Icon(Icons.add),
      ),
    );
  }
}
