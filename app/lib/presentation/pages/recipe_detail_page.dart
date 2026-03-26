import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:app/data/models/recipe.dart';
import 'package:app/presentation/providers/recipe_detail_provider.dart';
import 'package:app/presentation/providers/detail_providers.dart';

/// Recipe detail page showing full recipe information with scaling support.
class RecipeDetailPage extends ConsumerWidget {
  /// Creates a new recipe detail page.
  const RecipeDetailPage({super.key, required this.id});

  /// Recipe ID from route parameters.
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recipeAsync = ref.watch(recipeDetailProvider(id));

    return Scaffold(
      appBar: AppBar(
        title: recipeAsync.maybeWhen(
          data: (recipe) => Text(recipe.title),
          orElse: () => const Text('Recipe Details'),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: recipeAsync.when(
        data: (recipe) => _RecipeDetailContent(recipe: recipe, recipeId: id),
        loading: () => const _LoadingSkeleton(),
        error: (error, stack) => _ErrorView(message: error.toString()),
      ),
    );
  }
}

/// Main content of the recipe detail page.
class _RecipeDetailContent extends ConsumerWidget {
  const _RecipeDetailContent({required this.recipe, required this.recipeId});

  final Recipe recipe;
  final String recipeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Show error state if recipe has error status
    if (recipe.status == RecipeStatus.error) {
      return const _ErrorView(
        message: 'Failed to parse recipe',
        showRetry: false,
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Image section
          if (recipe.images.isNotEmpty) _ImageSection(images: recipe.images),

          // Meta section
          _MetaSection(recipe: recipe),

          const SizedBox(height: 24),

          // Scaling control
          _ScalingSection(
            recipeId: recipeId,
            originalServings: recipe.servings ?? 1,
          ),

          const SizedBox(height: 24),

          // Ingredients section
          _IngredientsSection(
            recipeId: recipeId,
            scaleFactor: ref.watch(scaleFactorProvider),
          ),

          const SizedBox(height: 24),

          // Steps section
          _StepsSection(recipeId: recipeId),
        ],
      ),
    );
  }
}

/// Image section displaying recipe photos.
class _ImageSection extends StatelessWidget {
  const _ImageSection({required this.images});

  final List<String> images;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: Image.network(
          images.first,
          fit: BoxFit.cover,
          errorBuilder: (context, error, stack) => Container(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: Icon(
              Icons.image_not_supported_outlined,
              size: 48,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}

/// Meta information section (servings, prep time, cook time).
class _MetaSection extends StatelessWidget {
  const _MetaSection({required this.recipe});

  final Recipe recipe;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _MetaItem(
          icon: Icons.people_outline,
          label: 'Servings',
          value: recipe.servings?.toString() ?? '-',
        ),
        _MetaItem(
          icon: Icons.timer_outlined,
          label: 'Prep',
          value: _formatTime(recipe.prepTimeMinutes),
        ),
        _MetaItem(
          icon: Icons.local_fire_department_outlined,
          label: 'Cook',
          value: _formatTime(recipe.cookTimeMinutes),
        ),
      ],
    );
  }

  String _formatTime(int? minutes) {
    if (minutes == null || minutes <= 0) return '-';
    if (minutes < 60) return '${minutes}m';
    final hours = minutes ~/ 60;
    final mins = minutes % 60;
    return mins > 0 ? '${hours}h ${mins}m' : '${hours}h';
  }
}

/// Individual meta item widget.
class _MetaItem extends StatelessWidget {
  const _MetaItem({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      children: [
        Icon(icon, color: theme.colorScheme.primary),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

/// Scaling section with slider to adjust servings.
class _ScalingSection extends ConsumerWidget {
  const _ScalingSection({
    required this.recipeId,
    required this.originalServings,
  });

  final String recipeId;
  final int originalServings;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final scaleFactor = ref.watch(scaleFactorProvider);
    final scaledServings = (originalServings * scaleFactor).round();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Scale Recipe',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  '$scaledServings servings',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Text('$originalServings', style: theme.textTheme.bodyMedium),
                Expanded(
                  child: Slider(
                    value: scaleFactor,
                    min: 0.5,
                    max: 4.0,
                    divisions: 14,
                    label: '${scaleFactor.toStringAsFixed(1)}x',
                    onChanged: (value) {
                      ref.read(scaleFactorProvider.notifier).state = value;
                    },
                  ),
                ),
                Text(
                  '${originalServings * 4}',
                  style: theme.textTheme.bodyMedium,
                ),
              ],
            ),
            Center(
              child: TextButton(
                onPressed: scaleFactor != 1.0
                    ? () {
                        ref.read(scaleFactorProvider.notifier).state = 1.0;
                      }
                    : null,
                child: const Text('Reset to Original'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Ingredients section with scaled quantities.
class _IngredientsSection extends ConsumerWidget {
  const _IngredientsSection({
    required this.recipeId,
    required this.scaleFactor,
  });

  final String recipeId;
  final double scaleFactor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ingredientsAsync = ref.watch(recipeIngredientsProvider(recipeId));
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Ingredients',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        ingredientsAsync.when(
          data: (ingredients) {
            if (ingredients.isEmpty) {
              return const _EmptyState(message: 'No ingredients found');
            }
            return Card(
              child: ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: ingredients.length,
                separatorBuilder: (context, index) => const Divider(height: 1),
                itemBuilder: (context, index) {
                  final ingredient = ingredients[index];
                  final scaledQuantity = ingredient.quantity != null
                      ? ingredient.quantity! * scaleFactor
                      : null;
                  return ListTile(
                    leading: Icon(
                      Icons.check_circle_outline,
                      color: theme.colorScheme.primary,
                    ),
                    title: Text(ingredient.name),
                    subtitle: Text(ingredient.notes ?? ''),
                    trailing: scaledQuantity != null
                        ? Text(
                            '${_formatQuantity(scaledQuantity)} ${ingredient.unit ?? ''}',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          )
                        : null,
                  );
                },
              ),
            );
          },
          loading: () => const _LoadingListItem(count: 4),
          error: (error, stack) => _ErrorView(message: error.toString()),
        ),
      ],
    );
  }

  String _formatQuantity(double quantity) {
    // Format nicely - remove unnecessary decimals
    if (quantity == quantity.roundToDouble()) {
      return quantity.toInt().toString();
    }
    // Common fractions
    final fractionMap = {0.25: '¼', 0.33: '⅓', 0.5: '½', 0.67: '⅔', 0.75: '¾'};
    final decimal = quantity - quantity.floor();
    for (final entry in fractionMap.entries) {
      if ((decimal - entry.key).abs() < 0.05) {
        return '${quantity.floor() > 0 ? "${quantity.floor()} " : ""}${entry.value}';
      }
    }
    return quantity.toStringAsFixed(1);
  }
}

/// Steps section with numbered instructions.
class _StepsSection extends ConsumerWidget {
  const _StepsSection({required this.recipeId});

  final String recipeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final stepsAsync = ref.watch(recipeStepsProvider(recipeId));
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Instructions',
          style: theme.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        stepsAsync.when(
          data: (steps) {
            if (steps.isEmpty) {
              return const _EmptyState(message: 'No instructions found');
            }
            return ListView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: steps.length,
              itemBuilder: (context, index) {
                final step = steps[index];
                return _StepItem(
                  stepNumber: index + 1,
                  instruction: step.instruction,
                  timerMinutes: step.timerMinutes,
                );
              },
            );
          },
          loading: () => const _LoadingListItem(count: 3),
          error: (error, stack) => _ErrorView(message: error.toString()),
        ),
      ],
    );
  }
}

/// Individual step item with number, instruction and optional timer.
class _StepItem extends StatelessWidget {
  const _StepItem({
    required this.stepNumber,
    required this.instruction,
    this.timerMinutes,
  });

  final int stepNumber;
  final String instruction;
  final int? timerMinutes;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: theme.colorScheme.primaryContainer,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                '$stepNumber',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: theme.colorScheme.onPrimaryContainer,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(instruction, style: theme.textTheme.bodyLarge),
                if (timerMinutes != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.secondaryContainer,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.timer,
                          size: 16,
                          color: theme.colorScheme.onSecondaryContainer,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '$timerMinutes min',
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: theme.colorScheme.onSecondaryContainer,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Empty state widget.
class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: Text(
          message,
          style: theme.textTheme.bodyLarge?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

/// Error view widget.
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, this.showRetry = true});

  final String message;
  final bool showRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(
              'Something went wrong',
              style: theme.textTheme.titleLarge?.copyWith(
                color: theme.colorScheme.error,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            if (showRetry) ...[
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => context.pop(),
                child: const Text('Go Back'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Loading skeleton for the entire page.
class _LoadingSkeleton extends StatelessWidget {
  const _LoadingSkeleton();

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Image skeleton
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Container(
              height: 200,
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
            ),
          ),
          const SizedBox(height: 24),

          // Meta skeleton
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(
              3,
              (index) => _SkeletonBox(width: 60, height: 60),
            ),
          ),
          const SizedBox(height: 24),

          // Scaling skeleton
          _SkeletonBox(width: double.infinity, height: 120),
          const SizedBox(height: 24),

          // Ingredients skeleton
          _SkeletonBox(width: 120, height: 24),
          const SizedBox(height: 12),
          _SkeletonBox(width: double.infinity, height: 200),
          const SizedBox(height: 24),

          // Steps skeleton
          _SkeletonBox(width: 120, height: 24),
          const SizedBox(height: 12),
          _SkeletonBox(width: double.infinity, height: 150),
        ],
      ),
    );
  }
}

/// Loading list item skeleton.
class _LoadingListItem extends StatelessWidget {
  const _LoadingListItem({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        children: List.generate(
          count,
          (index) => Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                _SkeletonBox(width: 24, height: 24, isCircle: true),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SkeletonBox(width: double.infinity, height: 16),
                      const SizedBox(height: 8),
                      _SkeletonBox(width: 100, height: 12),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Individual skeleton box for loading states.
class _SkeletonBox extends StatelessWidget {
  const _SkeletonBox({
    required this.width,
    required this.height,
    this.isCircle = false,
  });

  final double width;
  final double height;
  final bool isCircle;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.surfaceContainerHighest;

    if (isCircle) {
      return Container(
        width: width,
        height: height,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      );
    }

    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(8),
      ),
    );
  }
}
