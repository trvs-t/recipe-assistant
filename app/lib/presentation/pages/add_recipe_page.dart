import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:app/config/router.dart';
import 'package:app/presentation/providers/add_recipe_provider.dart';
import 'package:app/presentation/providers/manual_recipe_provider.dart';
import 'package:app/presentation/widgets/manual_recipe_form.dart';

/// Page for adding a new recipe via URL
class AddRecipePage extends ConsumerStatefulWidget {
  /// Creates a new add recipe page
  const AddRecipePage({super.key});

  @override
  ConsumerState<AddRecipePage> createState() => _AddRecipePageState();
}

class _AddRecipePageState extends ConsumerState<AddRecipePage> {
  final _urlController = TextEditingController();
  final _urlFocusNode = FocusNode();
  final _textController = TextEditingController();
  final _textFocusNode = FocusNode();

  @override
  void dispose() {
    _urlController.dispose();
    _urlFocusNode.dispose();
    _textController.dispose();
    _textFocusNode.dispose();
    super.dispose();
  }

  void _onUrlChanged(String value) {
    ref.read(addRecipeProvider.notifier).setUrl(value);
  }

  void _onTextChanged(String value) {
    ref.read(addRecipeProvider.notifier).setTextValue(value);
  }

  void _onModeChanged(AddRecipeInputMode mode) {
    ref.read(addRecipeProvider.notifier).setInputMode(mode);
  }

  void _onSubmit() {
    _urlFocusNode.unfocus();
    _textFocusNode.unfocus();
    ref.read(addRecipeProvider.notifier).submit();
  }

  void _onRetry() {
    ref.read(addRecipeProvider.notifier).reset();
    _urlController.clear();
    _textController.clear();
  }

  void _onViewRecipe(String id) {
    context.goRecipeDetail(id);
  }

  void _onBack() {
    if (ref.read(addRecipeProvider).status == AddRecipeStatus.success) {
      ref.read(addRecipeProvider.notifier).reset();
    }
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(addRecipeProvider);

    // Navigate to recipe detail on success for URL/Text mode
    ref.listen(addRecipeProvider, (previous, current) {
      if (current.status == AddRecipeStatus.success &&
          current.result != null &&
          (previous?.status != AddRecipeStatus.success)) {
        _onViewRecipe(current.result!.id);
      }
    });

    // Navigate to recipe detail on success for manual mode
    ref.listen(manualRecipeProvider, (previous, current) {
      if (current.status == ManualRecipeStatus.success &&
          current.result != null &&
          (previous?.status != ManualRecipeStatus.success)) {
        _onViewRecipe(current.result!.id);
      }
    });

    final isLoading =
        state.status == AddRecipeStatus.fetching ||
        state.status == AddRecipeStatus.parsing;
    final showRetry =
        state.errorCode == AddRecipeErrorCode.fetchFailed ||
        state.errorCode == AddRecipeErrorCode.rateLimit ||
        state.errorCode == AddRecipeErrorCode.parseFailed;

    // Determine if form is valid based on input mode
    final isUrlMode = state.inputMode == AddRecipeInputMode.url;
    final isTextMode = state.inputMode == AddRecipeInputMode.text;
    final isManualMode = state.inputMode == AddRecipeInputMode.manual;
    final isFormValid = isUrlMode
        ? (state.status != AddRecipeStatus.invalidUrl && state.url.isNotEmpty)
        : (isTextMode &&
              state.status != AddRecipeStatus.error &&
              state.textValue.length >= minTextLength &&
              state.textValue.length <= maxTextLength);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Recipe'),
        leading: IconButton(icon: const Icon(Icons.close), onPressed: _onBack),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Input Mode Segmented Control
            SegmentedButton<AddRecipeInputMode>(
              segments: const [
                ButtonSegment<AddRecipeInputMode>(
                  value: AddRecipeInputMode.url,
                  label: Text('From URL'),
                  icon: Icon(Icons.link),
                ),
                ButtonSegment<AddRecipeInputMode>(
                  value: AddRecipeInputMode.text,
                  label: Text('From Text'),
                  icon: Icon(Icons.text_fields),
                ),
                ButtonSegment<AddRecipeInputMode>(
                  value: AddRecipeInputMode.manual,
                  label: Text('Manual Entry'),
                  icon: Icon(Icons.edit),
                ),
              ],
              selected: {state.inputMode},
              onSelectionChanged: (selection) {
                _onModeChanged(selection.first);
              },
              showSelectedIcon: false,
            ),

            const SizedBox(height: 24),

            // Input Field based on mode
            if (isUrlMode)
              _buildUrlInput(state, isLoading)
            else if (isTextMode)
              _buildTextInput(state, isLoading)
            else if (isManualMode)
              const ManualRecipeForm(),

            const SizedBox(height: 24),

            // Submit Button or Loading (hidden for manual mode)
            if (!isManualMode) ...[
              if (isLoading)
                _buildLoadingState(state.status)
              else if (state.status == AddRecipeStatus.success)
                _buildSuccessState(state.result?.id)
              else if (state.status == AddRecipeStatus.error)
                _buildErrorState(state, showRetry)
              else
                _buildSubmitButton(isFormValid, isTextMode),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildUrlInput(AddRecipeState state, bool isLoading) {
    return TextField(
      controller: _urlController,
      focusNode: _urlFocusNode,
      decoration: InputDecoration(
        labelText: 'Recipe URL',
        hintText: 'Paste Recipe URL',
        prefixIcon: const Icon(Icons.link),
        errorText: state.status == AddRecipeStatus.invalidUrl
            ? _getErrorMessage(state.errorCode, state.errorMessage)
            : null,
      ),
      keyboardType: TextInputType.url,
      textInputAction: TextInputAction.done,
      autocorrect: false,
      onChanged: _onUrlChanged,
      onSubmitted: (_) => _onSubmit(),
      enabled: !isLoading,
    );
  }

  Widget _buildTextInput(AddRecipeState state, bool isLoading) {
    // Character counter
    final charCount = state.textValue.length;
    final charCountText = '$charCount / $maxTextLength';
    final isOverLimit = charCount > maxTextLength;
    final isUnderLimit = charCount > 0 && charCount < minTextLength;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _textController,
          focusNode: _textFocusNode,
          decoration: InputDecoration(
            labelText: 'Recipe Text',
            hintText: 'Paste your recipe here...',
            prefixIcon: const Icon(Icons.description),
            alignLabelWithHint: true,
            errorText:
                state.status == AddRecipeStatus.error &&
                    (state.errorCode == AddRecipeErrorCode.textTooShort ||
                        state.errorCode == AddRecipeErrorCode.textTooLong ||
                        state.errorCode == AddRecipeErrorCode.urlDetected)
                ? _getErrorMessage(state.errorCode, state.errorMessage)
                : null,
            counterText: charCountText,
            counterStyle: TextStyle(
              color: isOverLimit
                  ? Theme.of(context).colorScheme.error
                  : (isUnderLimit
                        ? Theme.of(context).colorScheme.secondary
                        : Theme.of(context).colorScheme.onSurfaceVariant),
              fontWeight: (isOverLimit || isUnderLimit)
                  ? FontWeight.w600
                  : null,
            ),
          ),
          maxLines: 10,
          minLines: 8,
          keyboardType: TextInputType.multiline,
          textInputAction: TextInputAction.newline,
          onChanged: _onTextChanged,
          enabled: !isLoading,
        ),

        // Helper text for text input
        if (state.textValue.isEmpty) ...[
          const SizedBox(height: 8),
          Text(
            'Enter at least $minTextLength characters. You can paste recipes from cookbooks, websites, or type them directly.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildLoadingState(AddRecipeStatus status) {
    final message = status == AddRecipeStatus.fetching
        ? 'Fetching recipe...'
        : 'Parsing recipe...';

    return Column(
      children: [
        const Center(child: CircularProgressIndicator()),
        const SizedBox(height: 16),
        Text(
          message,
          style: Theme.of(context).textTheme.bodyLarge,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildSuccessState(String? recipeId) {
    return Column(
      children: [
        Container(
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
                size: 32,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Recipe Added!',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Your recipe has been saved and is ready to view.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton.icon(
            onPressed: recipeId != null ? () => _onViewRecipe(recipeId) : null,
            icon: const Icon(Icons.visibility),
            label: const Text('View Recipe'),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: TextButton(
            onPressed: _onRetry,
            child: const Text('Add Another Recipe'),
          ),
        ),
      ],
    );
  }

  Widget _buildErrorState(AddRecipeState state, bool showRetry) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Theme.of(
              context,
            ).colorScheme.errorContainer.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(
                Icons.error_outline,
                color: Theme.of(context).colorScheme.error,
                size: 32,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _getErrorTitle(state.errorCode),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _getErrorMessage(state.errorCode, state.errorMessage),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (showRetry)
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => ref.read(addRecipeProvider.notifier).submit(),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          )
        else
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _onRetry,
              child: const Text('Try Again'),
            ),
          ),
      ],
    );
  }

  Widget _buildSubmitButton(bool isFormValid, bool isTextMode) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: isFormValid ? _onSubmit : null,
        child: Text(isTextMode ? 'Parse Recipe' : 'Save Recipe'),
      ),
    );
  }

  String _getErrorTitle(AddRecipeErrorCode errorCode) {
    switch (errorCode) {
      case AddRecipeErrorCode.invalidUrl:
        return 'Invalid URL';
      case AddRecipeErrorCode.fetchFailed:
        return 'Connection Failed';
      case AddRecipeErrorCode.parseFailed:
        return 'Parsing Failed';
      case AddRecipeErrorCode.rateLimit:
        return 'Too Many Requests';
      case AddRecipeErrorCode.duplicateUrl:
        return 'Recipe Already Exists';
      case AddRecipeErrorCode.textTooShort:
        return 'Text Too Short';
      case AddRecipeErrorCode.textTooLong:
        return 'Text Too Long';
      case AddRecipeErrorCode.urlDetected:
        return 'URL Detected';
      case AddRecipeErrorCode.unknown:
        return 'Something Went Wrong';
    }
  }

  String _getErrorMessage(AddRecipeErrorCode errorCode, String errorMessage) {
    // Use specific error message from provider if available
    if (errorMessage.isNotEmpty) {
      return errorMessage;
    }

    switch (errorCode) {
      case AddRecipeErrorCode.invalidUrl:
        return 'Please enter a valid recipe URL starting with http:// or https://';
      case AddRecipeErrorCode.fetchFailed:
        return 'Unable to fetch the recipe. Please check your connection and try again.';
      case AddRecipeErrorCode.parseFailed:
        return 'We couldn\'t parse that recipe. Please check the format and try again.';
      case AddRecipeErrorCode.rateLimit:
        return 'Too many requests. Please wait a moment and try again.';
      case AddRecipeErrorCode.duplicateUrl:
        return 'This recipe has already been added to your collection.';
      case AddRecipeErrorCode.textTooShort:
        return 'Your recipe text is too short. Please provide at least 50 characters.';
      case AddRecipeErrorCode.textTooLong:
        return 'Your recipe text is too long. Please keep it under 10,000 characters.';
      case AddRecipeErrorCode.urlDetected:
        return 'It looks like you pasted a URL. Please use the URL import tab instead.';
      case AddRecipeErrorCode.unknown:
        return 'An unexpected error occurred. Please try again.';
    }
  }
}
