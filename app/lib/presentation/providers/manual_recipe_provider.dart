import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:app/data/models/ingredient_input.dart';
import 'package:app/data/models/manual_recipe_input.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/presentation/providers/providers.dart';

part 'manual_recipe_provider.g.dart';

/// Status for the manual recipe form.
enum ManualRecipeStatus { empty, valid, invalid, submitting, success, error }

/// Input class for a recipe instruction step.
class StepInput {
  const StepInput({
    required this.id,
    required this.instruction,
    this.timerMinutes,
  });

  final String id;
  final String instruction;
  final int? timerMinutes;

  StepInput copyWith({String? id, String? instruction, int? timerMinutes}) {
    return StepInput(
      id: id ?? this.id,
      instruction: instruction ?? this.instruction,
      timerMinutes: timerMinutes ?? this.timerMinutes,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is StepInput &&
        other.id == id &&
        other.instruction == instruction &&
        other.timerMinutes == timerMinutes;
  }

  @override
  int get hashCode => Object.hash(id, instruction, timerMinutes);
}

/// State for the manual recipe form.
class ManualRecipeState {
  const ManualRecipeState({
    this.title = '',
    this.ingredients = const [],
    this.instructions = const [],
    this.status = ManualRecipeStatus.empty,
    this.errorMessage = '',
    this.result,
  });

  final String title;
  final List<IngredientInput> ingredients;
  final List<StepInput> instructions;
  final ManualRecipeStatus status;
  final String errorMessage;
  final Recipe? result;

  ManualRecipeState copyWith({
    String? title,
    List<IngredientInput>? ingredients,
    List<StepInput>? instructions,
    ManualRecipeStatus? status,
    String? errorMessage,
    Recipe? result,
  }) {
    return ManualRecipeState(
      title: title ?? this.title,
      ingredients: ingredients ?? this.ingredients,
      instructions: instructions ?? this.instructions,
      status: status ?? this.status,
      errorMessage: errorMessage ?? this.errorMessage,
      result: result ?? this.result,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is ManualRecipeState &&
        other.title == title &&
        other.ingredients == ingredients &&
        other.instructions == instructions &&
        other.status == status &&
        other.errorMessage == errorMessage &&
        other.result == result;
  }

  @override
  int get hashCode {
    return Object.hash(
      title,
      ingredients,
      instructions,
      status,
      errorMessage,
      result,
    );
  }
}

/// Notifier for managing manual recipe form state.
@riverpod
class ManualRecipe extends _$ManualRecipe {
  @override
  ManualRecipeState build() {
    return const ManualRecipeState();
  }

  void setTitle(String title) {
    final trimmedTitle = title.trim();
    state = state.copyWith(title: trimmedTitle);
    _updateValidationStatus();
  }

  void addIngredient(IngredientInput ingredient) {
    final updatedIngredients = [...state.ingredients, ingredient];
    state = state.copyWith(ingredients: updatedIngredients);
    _updateValidationStatus();
  }

  void removeIngredient(int index) {
    if (index < 0 || index >= state.ingredients.length) return;
    final updatedIngredients = [...state.ingredients]..removeAt(index);
    state = state.copyWith(ingredients: updatedIngredients);
    _updateValidationStatus();
  }

  void updateIngredient(int index, IngredientInput ingredient) {
    if (index < 0 || index >= state.ingredients.length) return;
    final updatedIngredients = [...state.ingredients];
    updatedIngredients[index] = ingredient;
    state = state.copyWith(ingredients: updatedIngredients);
    _updateValidationStatus();
  }

  void addInstruction(StepInput instruction) {
    final updatedInstructions = [...state.instructions, instruction];
    state = state.copyWith(instructions: updatedInstructions);
    _updateValidationStatus();
  }

  void removeInstruction(int index) {
    if (index < 0 || index >= state.instructions.length) return;
    final updatedInstructions = [...state.instructions]..removeAt(index);
    state = state.copyWith(instructions: updatedInstructions);
    _updateValidationStatus();
  }

  void updateInstruction(int index, StepInput instruction) {
    if (index < 0 || index >= state.instructions.length) return;
    final updatedInstructions = [...state.instructions];
    updatedInstructions[index] = instruction;
    state = state.copyWith(instructions: updatedInstructions);
    _updateValidationStatus();
  }

  bool validate() {
    final isValid = _isFormValid();
    state = state.copyWith(
      status: isValid ? ManualRecipeStatus.valid : ManualRecipeStatus.invalid,
      errorMessage: isValid ? '' : _getValidationErrorMessage(),
    );
    return isValid;
  }

  Future<void> submit() async {
    if (!_isFormValid()) {
      state = state.copyWith(
        status: ManualRecipeStatus.invalid,
        errorMessage: _getValidationErrorMessage(),
      );
      return;
    }

    state = state.copyWith(
      status: ManualRecipeStatus.submitting,
      errorMessage: '',
    );

    try {
      final repository = ref.read(recipeRepositoryProvider);
      final input = ManualRecipeInput(
        title: state.title.trim(),
        ingredients: state.ingredients,
        instructions: state.instructions.map((s) => s.instruction).toList(),
      );
      final recipe = await repository.createManualRecipe(input);

      if (!ref.mounted) return;

      state = state.copyWith(
        status: ManualRecipeStatus.success,
        result: recipe,
      );
    } catch (e) {
      if (!ref.mounted) return;

      state = state.copyWith(
        status: ManualRecipeStatus.error,
        errorMessage: 'Failed to save recipe: ${e.toString()}',
      );
    }
  }

  void reset() {
    state = const ManualRecipeState();
  }

  bool _isFormValid() {
    return state.title.trim().isNotEmpty &&
        state.ingredients.isNotEmpty &&
        state.instructions.isNotEmpty;
  }

  String _getValidationErrorMessage() {
    if (state.title.trim().isEmpty) {
      return 'Please enter a recipe title';
    }
    if (state.ingredients.isEmpty) {
      return 'Please add at least one ingredient';
    }
    if (state.instructions.isEmpty) {
      return 'Please add at least one instruction';
    }
    return '';
  }

  void _updateValidationStatus() {
    final isValid = _isFormValid();
    final newStatus = isValid
        ? ManualRecipeStatus.valid
        : ManualRecipeStatus.empty;
    if (state.status != newStatus &&
        state.status != ManualRecipeStatus.submitting) {
      state = state.copyWith(status: newStatus, errorMessage: '');
    }
  }
}
