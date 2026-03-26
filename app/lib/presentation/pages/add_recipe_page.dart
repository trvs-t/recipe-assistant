import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:app/config/router.dart';
import 'package:app/presentation/providers/add_recipe_provider.dart';

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

  @override
  void dispose() {
    _urlController.dispose();
    _urlFocusNode.dispose();
    super.dispose();
  }

  void _onUrlChanged(String value) {
    ref.read(addRecipeProvider.notifier).setUrl(value);
  }

  void _onSubmit() {
    _urlFocusNode.unfocus();
    ref.read(addRecipeProvider.notifier).submit();
  }

  void _onRetry() {
    ref.read(addRecipeProvider.notifier).reset();
    _urlController.clear();
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
    final isLoading =
        state.status == AddRecipeStatus.fetching ||
        state.status == AddRecipeStatus.parsing;
    final isValidUrl =
        state.status != AddRecipeStatus.invalidUrl && state.url.isNotEmpty;
    final showRetry =
        state.errorCode == AddRecipeErrorCode.fetchFailed ||
        state.errorCode == AddRecipeErrorCode.rateLimit;

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
            // URL Input Field
            TextField(
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
            ),

            const SizedBox(height: 24),

            // Submit Button or Loading
            if (isLoading)
              _buildLoadingState(state.status)
            else if (state.status == AddRecipeStatus.success)
              _buildSuccessState(state.result?.id)
            else if (state.status == AddRecipeStatus.error)
              _buildErrorState(state, showRetry)
            else
              _buildSubmitButton(isValidUrl),
          ],
        ),
      ),
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

  Widget _buildSubmitButton(bool isValidUrl) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: isValidUrl ? _onSubmit : null,
        child: const Text('Save Recipe'),
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
        return 'We couldn\'t parse this recipe. The website may not be supported.';
      case AddRecipeErrorCode.rateLimit:
        return 'Too many requests. Please wait a moment and try again.';
      case AddRecipeErrorCode.duplicateUrl:
        return 'This recipe has already been added to your collection.';
      case AddRecipeErrorCode.unknown:
        return 'An unexpected error occurred. Please try again.';
    }
  }
}
