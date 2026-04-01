import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:app/config/router.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/presentation/providers/recipe_list_provider.dart';

/// Home page displaying list of recipes
class RecipeListPage extends ConsumerWidget {
  /// Creates a new recipe list page
  const RecipeListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recipeListAsync = ref.watch(recipeListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My Recipes')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.goAddRecipe(),
        child: const Icon(Icons.add),
      ),
      body: recipeListAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => _ErrorState(
          error: error.toString(),
          onRetry: () => ref.read(recipeListProvider.notifier).refreshRecipes(),
        ),
        data: (recipes) {
          if (recipes.isEmpty) {
            return const _EmptyState();
          }
          return _RecipeListView(recipes: recipes);
        },
      ),
    );
  }
}

/// Widget showing an empty state when no recipes exist
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.restaurant_menu,
              size: 80,
              color: Theme.of(
                context,
              ).colorScheme.primary.withValues(alpha: 0.4),
            ),
            const SizedBox(height: 24),
            Text(
              'No recipes yet',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              'Add your first recipe by tapping the + button',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

/// Widget showing error state with retry button
class _ErrorState extends StatelessWidget {
  final String error;
  final VoidCallback onRetry;

  const _ErrorState({required this.error, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 80,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 24),
            Text(
              'Something went wrong',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              'Failed to load recipes',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            SelectableText(
              error,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(
                  context,
                ).colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
                fontFamily: 'monospace',
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Widget displaying the list of recipe cards with pull-to-refresh
class _RecipeListView extends ConsumerWidget {
  final List<Recipe> recipes;

  const _RecipeListView({required this.recipes});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return RefreshIndicator(
      onRefresh: () => ref.read(recipeListProvider.notifier).refreshRecipes(),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: recipes.length,
        itemBuilder: (context, index) {
          final recipe = recipes[index];
          return RecipeCard(recipe: recipe);
        },
      ),
    );
  }
}

/// Card widget displaying a recipe summary
class RecipeCard extends StatelessWidget {
  final Recipe recipe;

  const RecipeCard({super.key, required this.recipe});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: InkWell(
        onTap: () => context.goRecipeDetail(recipe.id),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      recipe.title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _StatusBadge(status: recipe.status),
                ],
              ),
              if (recipe.sourceUrl != null) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(
                      Icons.link,
                      size: 14,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        _truncateUrl(recipe.sourceUrl!),
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _truncateUrl(String url) {
    // Remove protocol and www prefix for cleaner display
    var display = url.replaceAll(RegExp(r'^https?://'), '');
    if (display.startsWith('www.')) {
      display = display.substring(4);
    }
    // Truncate if too long
    if (display.length > 40) {
      display = '${display.substring(0, 37)}...';
    }
    return display;
  }
}

/// Badge widget showing recipe status
class _StatusBadge extends StatelessWidget {
  final RecipeStatus status;

  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      RecipeStatus.parsed => (Theme.of(context).colorScheme.primary, 'Parsed'),
      RecipeStatus.error => (Theme.of(context).colorScheme.error, 'Error'),
      RecipeStatus.pending => (
        Theme.of(context).colorScheme.secondary,
        'Pending',
      ),
      RecipeStatus.draft => (Theme.of(context).colorScheme.outline, 'Draft'),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
