import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:app/presentation/providers/manual_recipe_provider.dart';

/// Maximum number of instructions allowed.
const int maxInstructions = 100;

/// Widget for a single instruction row with text field and remove button.
class InstructionInputRow extends ConsumerStatefulWidget {
  /// Creates an instruction input row.
  const InstructionInputRow({
    super.key,
    required this.index,
    required this.stepInput,
    required this.onChanged,
    required this.onRemove,
  });

  /// The index of this instruction in the list.
  final int index;

  /// The current step input data.
  final StepInput stepInput;

  /// Callback when the instruction text changes.
  final ValueChanged<StepInput> onChanged;

  /// Callback when the remove button is pressed.
  final VoidCallback onRemove;

  @override
  ConsumerState<InstructionInputRow> createState() =>
      _InstructionInputRowState();
}

class _InstructionInputRowState extends ConsumerState<InstructionInputRow> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.stepInput.instruction);
  }

  @override
  void didUpdateWidget(covariant InstructionInputRow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.stepInput.instruction != widget.stepInput.instruction &&
        _controller.text != widget.stepInput.instruction) {
      _controller.text = widget.stepInput.instruction;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    widget.onChanged(widget.stepInput.copyWith(instruction: value));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: TextField(
              controller: _controller,
              decoration: InputDecoration(
                labelText: 'Step ${widget.index + 1}',
                hintText: 'Enter instruction...',
                alignLabelWithHint: true,
              ),
              maxLines: 3,
              minLines: 2,
              keyboardType: TextInputType.multiline,
              textInputAction: TextInputAction.newline,
              onChanged: _onChanged,
            ),
          ),
          const SizedBox(width: 8),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: IconButton(
              onPressed: widget.onRemove,
              icon: const Icon(Icons.remove_circle_outline),
              color: Theme.of(context).colorScheme.error,
              tooltip: 'Remove instruction',
            ),
          ),
        ],
      ),
    );
  }
}

/// Widget that manages the list of instruction inputs.
class InstructionListWidget extends ConsumerStatefulWidget {
  /// Creates an instruction list widget.
  const InstructionListWidget({super.key});

  @override
  ConsumerState<InstructionListWidget> createState() =>
      _InstructionListWidgetState();
}

class _InstructionListWidgetState extends ConsumerState<InstructionListWidget> {
  String _generateId() {
    return DateTime.now().microsecondsSinceEpoch.toString();
  }

  void _addInstruction() {
    final state = ref.read(manualRecipeProvider);
    if (state.instructions.length >= maxInstructions) return;

    final newInstruction = StepInput(id: _generateId(), instruction: '');
    ref.read(manualRecipeProvider.notifier).addInstruction(newInstruction);
  }

  void _removeInstruction(int index) {
    ref.read(manualRecipeProvider.notifier).removeInstruction(index);
  }

  void _updateInstruction(int index, StepInput instruction) {
    ref
        .read(manualRecipeProvider.notifier)
        .updateInstruction(index, instruction);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(manualRecipeProvider);
    final instructions = state.instructions;
    final canAddMore = instructions.length < maxInstructions;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...List.generate(
          instructions.length,
          (index) => InstructionInputRow(
            key: ValueKey(instructions[index].id),
            index: index,
            stepInput: instructions[index],
            onChanged: (updated) => _updateInstruction(index, updated),
            onRemove: () => _removeInstruction(index),
          ),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: canAddMore ? _addInstruction : null,
          icon: const Icon(Icons.add),
          label: Text(
            canAddMore
                ? 'Add Instruction'
                : 'Maximum $maxInstructions instructions reached',
          ),
        ),
      ],
    );
  }
}
