import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart';
import 'package:app/presentation/providers/providers.dart';

part 'add_recipe_provider.g.dart';

/// Error codes for add recipe failures.
enum AddRecipeErrorCode {
  /// Invalid URL format provided.
  invalidUrl,

  /// Failed to fetch content from URL.
  fetchFailed,

  /// Failed to parse recipe content.
  parseFailed,

  /// Rate limit exceeded.
  rateLimit,

  /// Duplicate URL - recipe already exists.
  duplicateUrl,

  /// Unknown error occurred.
  unknown,
}

/// Validation status for the URL input form.
enum AddRecipeStatus {
  /// Initial empty state.
  empty,

  /// URL format is invalid.
  invalidUrl,

  /// URL is valid, fetching content.
  fetching,

  /// Content fetched, parsing recipe.
  parsing,

  /// Recipe successfully created.
  success,

  /// Error occurred during processing.
  error,
}

/// State for the add recipe form.
class AddRecipeState {
  /// Creates an [AddRecipeState] with default values.
  const AddRecipeState({
    this.url = '',
    this.status = AddRecipeStatus.empty,
    this.errorCode = AddRecipeErrorCode.unknown,
    this.errorMessage = '',
    this.result,
  });

  /// The URL input by the user.
  final String url;

  /// Current validation status.
  final AddRecipeStatus status;

  /// Error code if status is error.
  final AddRecipeErrorCode errorCode;

  /// Error message if status is error.
  final String errorMessage;

  /// The created recipe if successful.
  final Recipe? result;

  /// Creates a copy of this state with the given fields replaced.
  AddRecipeState copyWith({
    String? url,
    AddRecipeStatus? status,
    AddRecipeErrorCode? errorCode,
    String? errorMessage,
    Recipe? result,
  }) {
    return AddRecipeState(
      url: url ?? this.url,
      status: status ?? this.status,
      errorCode: errorCode ?? this.errorCode,
      errorMessage: errorMessage ?? this.errorMessage,
      result: result ?? this.result,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is AddRecipeState &&
        other.url == url &&
        other.status == status &&
        other.errorCode == errorCode &&
        other.errorMessage == errorMessage &&
        other.result == result;
  }

  @override
  int get hashCode {
    return Object.hash(url, status, errorCode, errorMessage, result);
  }
}

/// URL validation regex pattern.
final _urlRegex = RegExp(
  r'^https?:\/\/([\w\-]+\.)+[\w\-]+(\/[\w\-._~:/?#\[\]@!$&()*+,;=]*)?$',
  caseSensitive: false,
);

/// Notifier for managing add recipe form state.
///
/// Handles URL input validation and submission workflow.
@riverpod
class AddRecipe extends _$AddRecipe {
  @override
  AddRecipeState build() {
    return const AddRecipeState();
  }

  /// Repository for creating recipes.
  IRecipeRepository get _repository => ref.watch(recipeRepositoryProvider);

  /// Updates the URL and validates its format.
  ///
  /// Does not trigger submission - just validates the format.
  void setUrl(String url) {
    final trimmedUrl = url.trim();

    if (trimmedUrl.isEmpty) {
      state = const AddRecipeState();
      return;
    }

    final isValid = _isValidUrl(trimmedUrl);
    state = state.copyWith(
      url: trimmedUrl,
      status: isValid ? AddRecipeStatus.empty : AddRecipeStatus.invalidUrl,
      errorCode: isValid
          ? AddRecipeErrorCode.unknown
          : AddRecipeErrorCode.invalidUrl,
      errorMessage: isValid ? '' : 'Please enter a valid URL',
    );
  }

  /// Submits the URL to create a new recipe.
  ///
  /// Validates URL format, then calls repository.createRecipe(url).
  /// Updates state throughout the workflow: fetching -> parsing -> success/error.
  Future<void> submit() async {
    final url = state.url.trim();

    // Validate URL format before submission
    if (url.isEmpty || !_isValidUrl(url)) {
      state = state.copyWith(
        status: AddRecipeStatus.invalidUrl,
        errorCode: AddRecipeErrorCode.invalidUrl,
        errorMessage: 'Please enter a valid URL',
      );
      return;
    }

    // Start fetching
    state = state.copyWith(status: AddRecipeStatus.fetching, errorMessage: '');

    try {
      // Call repository to create recipe (validates and parses)
      final recipe = await _repository.createRecipe(url);

      state = state.copyWith(status: AddRecipeStatus.success, result: recipe);
    } on ValidationException {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.invalidUrl,
        errorMessage: 'This URL is not a valid recipe page',
      );
    } on ParseException catch (e) {
      final errorCode = _mapParseExceptionToErrorCode(e);
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: errorCode,
        errorMessage: e.message,
      );
    } on NetworkException catch (e) {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.fetchFailed,
        errorMessage: e.retryable
            ? 'Network error. Please check your connection and try again.'
            : 'Failed to connect. Please try again later.',
      );
    } on DatabaseException catch (e) {
      // Check for duplicate URL error (case-insensitive check for 'duplicate')
      if (e.message.toLowerCase().contains('duplicate') ||
          e.message.contains('23505')) {
        state = state.copyWith(
          status: AddRecipeStatus.error,
          errorCode: AddRecipeErrorCode.duplicateUrl,
          errorMessage: 'This recipe has already been added',
        );
      } else {
        state = state.copyWith(
          status: AddRecipeStatus.error,
          errorCode: AddRecipeErrorCode.unknown,
          errorMessage: 'Failed to save recipe. Please try again.',
        );
      }
    } catch (e) {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.unknown,
        errorMessage: 'An unexpected error occurred. Please try again.',
      );
    }
  }

  /// Resets the form state for a new submission.
  void reset() {
    state = const AddRecipeState();
  }

  /// Validates URL format.
  bool _isValidUrl(String url) {
    return _urlRegex.hasMatch(url);
  }

  /// Maps [ParseException] to [AddRecipeErrorCode].
  AddRecipeErrorCode _mapParseExceptionToErrorCode(ParseException e) {
    switch (e.errorCode) {
      case ErrorCode.invalidUrl:
        return AddRecipeErrorCode.invalidUrl;
      case ErrorCode.fetchFailed:
        return AddRecipeErrorCode.fetchFailed;
      case ErrorCode.parseFailed:
        return AddRecipeErrorCode.parseFailed;
      case ErrorCode.rateLimit:
        return AddRecipeErrorCode.rateLimit;
    }
  }
}
