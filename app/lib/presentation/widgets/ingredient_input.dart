import 'package:flutter/material.dart';

import 'package:app/data/models/ingredient_input.dart';

/// Maximum number of ingredients allowed.
const int maxIngredients = 100;

/// A single row of ingredient input fields.
///
/// Fields: quantity (optional), unit (optional), name (required), notes (optional).
class IngredientInputRow extends StatefulWidget {
  const IngredientInputRow({
    required this.index,
    required this.ingredient,
    required this.onChanged,
    required this.onRemove,
    super.key,
  });

  final int index;
  final IngredientInput ingredient;
  final void Function(IngredientInput) onChanged;
  final void Function() onRemove;

  @override
  State<IngredientInputRow> createState() => _IngredientInputRowState();
}

class _IngredientInputRowState extends State<IngredientInputRow> {
  late final TextEditingController _quantityController;
  late final TextEditingController _unitController;
  late final TextEditingController _nameController;
  late final TextEditingController _notesController;

  @override
  void initState() {
    super.initState();
    _quantityController = TextEditingController(
      text: widget.ingredient.quantity?.toString() ?? '',
    );
    _unitController = TextEditingController(text: widget.ingredient.unit ?? '');
    _nameController = TextEditingController(text: widget.ingredient.name);
    _notesController = TextEditingController(
      text: widget.ingredient.notes ?? '',
    );
  }

  @override
  void dispose() {
    _quantityController.dispose();
    _unitController.dispose();
    _nameController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _notifyChange() {
    final quantityText = _quantityController.text.trim();
    final quantity = quantityText.isEmpty
        ? null
        : double.tryParse(quantityText);

    final name = _nameController.text.trim();

    // Don't update if name is empty (required field)
    if (name.isEmpty) return;

    widget.onChanged(
      IngredientInput(
        quantity: quantity,
        unit: _unitController.text.trim().isEmpty
            ? null
            : _unitController.text.trim(),
        name: name,
        notes: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Quantity field
          SizedBox(
            width: 70,
            child: TextField(
              controller: _quantityController,
              decoration: const InputDecoration(
                labelText: 'Qty',
                hintText: '2',
              ),
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              textAlign: TextAlign.center,
              onChanged: (_) => _notifyChange(),
            ),
          ),
          const SizedBox(width: 8),
          // Unit field
          SizedBox(
            width: 70,
            child: TextField(
              controller: _unitController,
              decoration: const InputDecoration(
                labelText: 'Unit',
                hintText: 'cup',
              ),
              textAlign: TextAlign.center,
              onChanged: (_) => _notifyChange(),
            ),
          ),
          const SizedBox(width: 8),
          // Name field (required)
          Expanded(
            child: TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Ingredient',
                hintText: 'flour',
              ),
              onChanged: (_) => _notifyChange(),
            ),
          ),
          const SizedBox(width: 8),
          // Notes field
          SizedBox(
            width: 90,
            child: TextField(
              controller: _notesController,
              decoration: const InputDecoration(
                labelText: 'Notes',
                hintText: 'sifted',
              ),
              onChanged: (_) => _notifyChange(),
            ),
          ),
          const SizedBox(width: 4),
          // Remove button
          IconButton(
            onPressed: widget.onRemove,
            icon: Icon(
              Icons.remove_circle_outline,
              color: Theme.of(context).colorScheme.error,
            ),
            tooltip: 'Remove ingredient',
          ),
        ],
      ),
    );
  }
}

/// Widget that manages a list of ingredient input rows.
class IngredientListWidget extends StatelessWidget {
  const IngredientListWidget({
    required this.ingredients,
    required this.onIngredientsChanged,
    super.key,
  });

  final List<IngredientInput> ingredients;
  final void Function(List<IngredientInput>) onIngredientsChanged;

  void _addIngredient() {
    if (ingredients.length >= maxIngredients) return;
    onIngredientsChanged([...ingredients, const IngredientInput(name: '')]);
  }

  void _removeIngredient(int index) {
    if (index < 0 || index >= ingredients.length) return;
    final updated = [...ingredients]..removeAt(index);
    onIngredientsChanged(updated);
  }

  void _updateIngredient(int index, IngredientInput ingredient) {
    if (index < 0 || index >= ingredients.length) return;
    // Don't update if name is empty
    if (ingredient.name.trim().isEmpty) return;
    final updated = [...ingredients];
    updated[index] = ingredient;
    onIngredientsChanged(updated);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Header row
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(
            children: [
              const SizedBox(width: 78), // qty + spacing
              const SizedBox(width: 8),
              const SizedBox(width: 78), // unit + spacing
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Ingredients',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              const SizedBox(width: 98), // notes + spacing
              const SizedBox(width: 52), // remove button
            ],
          ),
        ),
        // Ingredient rows
        ...List.generate(ingredients.length, (index) {
          return IngredientInputRow(
            key: ValueKey('ingredient_$index'),
            index: index,
            ingredient: ingredients[index],
            onChanged: (ingredient) => _updateIngredient(index, ingredient),
            onRemove: () => _removeIngredient(index),
          );
        }),
        // Add button
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: OutlinedButton.icon(
            onPressed: ingredients.length < maxIngredients
                ? _addIngredient
                : null,
            icon: const Icon(Icons.add),
            label: Text(
              ingredients.length < maxIngredients
                  ? 'Add Ingredient'
                  : 'Maximum $maxIngredients ingredients reached',
            ),
          ),
        ),
      ],
    );
  }
}
