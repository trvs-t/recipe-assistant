import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:app/data/models/ingredient_input.dart';
import 'package:app/presentation/providers/manual_recipe_provider.dart';
import 'package:app/presentation/widgets/ingredient_input.dart';
import 'package:app/presentation/widgets/instruction_input.dart';

/// Form widget for manually entering a recipe.
class ManualRecipeForm extends ConsumerStatefulWidget {
  /// Creates a manual recipe form.
  const ManualRecipeForm({super.key});

  @override
  ConsumerState<ManualRecipeForm> createState() => _ManualRecipeFormState();
}

class _ManualRecipeFormState extends ConsumerState<ManualRecipeForm> {
  final _titleController = TextEditingController();
  final _titleFocusNode = FocusNode();

  @override
  void dispose() {
    _titleController.dispose();
    _titleFocusNode.dispose();
    super.dispose();
  }

  void _onTitleChanged(String value) {
    ref.read(manualRecipeProvider.notifier).setTitle(value);
  }

  void _onSubmit() {
    _titleFocusNode.unfocus();
    ref.read(manualRecipeProvider.notifier).submit();
  }

  void _onCancel() {
    ref.read(manualRecipeProvider.notifier).reset();
    _titleController.clear();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(manualRecipeProvider);

    final isLoading = state.status == ManualRecipeStatus.submitting;
    final isValid = state.status == ManualRecipeStatus.valid;
    final hasError =
        state.status == ManualRecipeStatus.error ||
        state.status == ManualRecipeStatus.invalid;
    final isSuccess = state.status == ManualRecipeStatus.success;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Title TextField
          TextField(
            controller: _titleController,
            focusNode: _titleFocusNode,
            decoration: InputDecoration(
              labelText: 'Recipe Title',
              hintText: 'Enter recipe name',
              prefixIcon: const Icon(Icons.restaurant_menu),
              errorText: state.title.isEmpty && hasError
                  ? 'Please enter a recipe title'
                  : null,
            ),
            textInputAction: TextInputAction.next,
            onChanged: _onTitleChanged,
            enabled: !isLoading,
          ),

          const SizedBox(height: 24),

          // Ingredient List Section
          _buildSectionHeader(
            context,
            title: 'Ingredients',
            icon: Icons.list_alt,
            onAdd: isLoading ? null : () => _showAddIngredientDialog(context),
          ),

          const SizedBox(height: 8),

          if (state.ingredients.isEmpty)
            _buildEmptyState(
              context,
              message: 'No ingredients added yet',
              hint: 'Tap + to add ingredients',
            )
          else
            _buildIngredientList(state, isLoading),

          const SizedBox(height: 24),

          // Instruction List Section
          _buildSectionHeader(
            context,
            title: 'Instructions',
            icon: Icons.format_list_numbered,
            onAdd: isLoading ? null : () => _showAddInstructionDialog(context),
          ),

          const SizedBox(height: 8),

          if (state.instructions.isEmpty)
            _buildEmptyState(
              context,
              message: 'No instructions added yet',
              hint: 'Tap + to add steps',
            )
          else
            _buildInstructionList(state, isLoading),

          const SizedBox(height: 24),

          // Error Message Display
          if (hasError && state.errorMessage.isNotEmpty) ...[
            _buildErrorBanner(context, state.errorMessage),
            const SizedBox(height: 16),
          ],

          // Success Message Display
          if (isSuccess) ...[
            _buildSuccessBanner(context),
            const SizedBox(height: 16),
          ],

          // Loading State
          if (isLoading)
            _buildLoadingState()
          else ...[
            // Submit Button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: isValid ? _onSubmit : null,
                child: const Text('Save Recipe'),
              ),
            ),

            const SizedBox(height: 12),

            // Cancel Button
            SizedBox(
              width: double.infinity,
              child: TextButton(
                onPressed: isLoading ? null : _onCancel,
                child: const Text('Cancel'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSectionHeader(
    BuildContext context, {
    required String title,
    required IconData icon,
    VoidCallback? onAdd,
  }) {
    return Row(
      children: [
        Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 8),
        Text(
          title,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
        ),
        const Spacer(),
        if (onAdd != null)
          IconButton(
            icon: const Icon(Icons.add_circle_outline),
            onPressed: onAdd,
            tooltip: 'Add $title',
          ),
      ],
    );
  }

  Widget _buildEmptyState(
    BuildContext context, {
    required String message,
    required String hint,
  }) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Theme.of(
          context,
        ).colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.3),
          style: BorderStyle.solid,
        ),
      ),
      child: Column(
        children: [
          Icon(
            Icons.info_outline,
            size: 32,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            hint,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildIngredientList(ManualRecipeState state, bool isLoading) {
    // Placeholder for IngredientListWidget - will be replaced in Task 6
    return Column(
      children: [
        for (var i = 0; i < state.ingredients.length; i++)
          _buildIngredientItem(state.ingredients[i], i, isLoading),
      ],
    );
  }

  Widget _buildIngredientItem(dynamic ingredient, int index, bool isLoading) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          child: Text(
            '${index + 1}',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onPrimaryContainer,
            ),
          ),
        ),
        title: Text(ingredient.name),
        subtitle: Text(
          [
            if (ingredient.quantity != null) ingredient.quantity.toString(),
            if (ingredient.unit != null) ingredient.unit,
          ].join(' '),
        ),
        trailing: isLoading
            ? null
            : IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: () {
                  ref
                      .read(manualRecipeProvider.notifier)
                      .removeIngredient(index);
                },
              ),
      ),
    );
  }

  Widget _buildInstructionList(ManualRecipeState state, bool isLoading) {
    // Placeholder for InstructionListWidget - will be replaced in Task 7
    return Column(
      children: [
        for (var i = 0; i < state.instructions.length; i++)
          _buildInstructionItem(state.instructions[i], i, isLoading),
      ],
    );
  }

  Widget _buildInstructionItem(
    StepInput instruction,
    int index,
    bool isLoading,
  ) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: Theme.of(context).colorScheme.secondaryContainer,
          child: Text(
            '${index + 1}',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSecondaryContainer,
            ),
          ),
        ),
        title: Text(instruction.instruction),
        subtitle: instruction.timerMinutes != null
            ? Text('Timer: ${instruction.timerMinutes} min')
            : null,
        trailing: isLoading
            ? null
            : IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: () {
                  ref
                      .read(manualRecipeProvider.notifier)
                      .removeInstruction(index);
                },
              ),
      ),
    );
  }

  Widget _buildErrorBanner(BuildContext context, String message) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(
          context,
        ).colorScheme.errorContainer.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: Theme.of(context).colorScheme.error),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              message,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.error,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSuccessBanner(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(
          context,
        ).colorScheme.primaryContainer.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
            Icons.check_circle,
            color: Theme.of(context).colorScheme.primary,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'Recipe saved successfully!',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoadingState() {
    return Column(
      children: [
        const Center(child: CircularProgressIndicator()),
        const SizedBox(height: 16),
        Text(
          'Saving recipe...',
          style: Theme.of(context).textTheme.bodyLarge,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  void _showAddIngredientDialog(BuildContext context) {
    final nameController = TextEditingController();
    final quantityController = TextEditingController();
    final unitController = TextEditingController();

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Ingredient'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(
                labelText: 'Ingredient Name *',
                hintText: 'e.g., flour',
              ),
              autofocus: true,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: quantityController,
                    decoration: const InputDecoration(
                      labelText: 'Quantity',
                      hintText: 'e.g., 2',
                    ),
                    keyboardType: TextInputType.number,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: unitController,
                    decoration: const InputDecoration(
                      labelText: 'Unit',
                      hintText: 'e.g., cups',
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (nameController.text.trim().isEmpty) return;

              final quantity = double.tryParse(quantityController.text);
              final ingredient = IngredientInput(
                name: nameController.text.trim(),
                quantity: quantity,
                unit: unitController.text.trim().isEmpty
                    ? null
                    : unitController.text.trim(),
              );

              ref.read(manualRecipeProvider.notifier).addIngredient(ingredient);
              Navigator.of(context).pop();
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  void _showAddInstructionDialog(BuildContext context) {
    final instructionController = TextEditingController();
    final timerController = TextEditingController();

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Instruction'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: instructionController,
              decoration: const InputDecoration(
                labelText: 'Instruction *',
                hintText: 'e.g., Preheat oven to 350°F',
              ),
              maxLines: 3,
              autofocus: true,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: timerController,
              decoration: const InputDecoration(
                labelText: 'Timer (minutes)',
                hintText: 'Optional',
              ),
              keyboardType: TextInputType.number,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (instructionController.text.trim().isEmpty) return;

              final timerMinutes = int.tryParse(timerController.text);
              final instruction = StepInput(
                id: DateTime.now().millisecondsSinceEpoch.toString(),
                instruction: instructionController.text.trim(),
                timerMinutes: timerMinutes,
              );

              ref
                  .read(manualRecipeProvider.notifier)
                  .addInstruction(instruction);
              Navigator.of(context).pop();
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }
}
