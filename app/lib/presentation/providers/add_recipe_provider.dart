import 'package:riverpod_annotation/riverpod_annotation.dart';

import 'package:app/core/errors/exceptions.dart';
import 'package:app/data/models/manual_recipe_input.dart';
import 'package:app/data/models/recipe.dart';
import 'package:app/data/repositories/i_recipe_repository.dart';
import 'package:app/presentation/providers/manual_recipe_provider.dart';
import 'package:app/presentation/providers/providers.dart';

part 'add_recipe_provider.g.dart';

/// Input mode for add recipe form.
enum AddRecipeInputMode {
  /// URL input mode.
  url,

  /// Direct text input mode.
  text,

  /// Manual entry mode.
  manual,
}

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

  /// Text input is too short.
  textTooShort,

  /// Text input is too long.
  textTooLong,

  /// URL detected in text input.
  urlDetected,

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
    this.inputMode = AddRecipeInputMode.url,
    this.url = '',
    this.textValue = '',
    this.status = AddRecipeStatus.empty,
    this.errorCode = AddRecipeErrorCode.unknown,
    this.errorMessage = '',
    this.result,
  });

  /// Current input mode (URL or text).
  final AddRecipeInputMode inputMode;

  /// The URL input by the user.
  final String url;

  /// The text input by the user (for direct recipe text entry).
  final String textValue;

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
    AddRecipeInputMode? inputMode,
    String? url,
    String? textValue,
    AddRecipeStatus? status,
    AddRecipeErrorCode? errorCode,
    String? errorMessage,
    Recipe? result,
  }) {
    return AddRecipeState(
      inputMode: inputMode ?? this.inputMode,
      url: url ?? this.url,
      textValue: textValue ?? this.textValue,
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
        other.inputMode == inputMode &&
        other.url == url &&
        other.textValue == textValue &&
        other.status == status &&
        other.errorCode == errorCode &&
        other.errorMessage == errorMessage &&
        other.result == result;
  }

  @override
  int get hashCode {
    return Object.hash(
      inputMode,
      url,
      textValue,
      status,
      errorCode,
      errorMessage,
      result,
    );
  }
}

/// URL validation regex pattern.
final _urlRegex = RegExp(
  r'^https?:\/\/([\w\-]+\.)+[\w\-]+(\/[\w\-._~:/?#\[\]@!$&()*+,;=]*)?$',
  caseSensitive: false,
);

/// Minimum text input length for recipe.
const int minTextLength = 50;

/// Maximum text input length for recipe.
const int maxTextLength = 10000;

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
      state = AddRecipeState(inputMode: state.inputMode);
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

  /// Sets the input mode (URL or text).
  void setInputMode(AddRecipeInputMode mode) {
    if (state.inputMode == mode) return;

    // Reset form when switching modes
    state = AddRecipeState(inputMode: mode);
  }

  /// Updates the text input and validates in real-time.
  ///
  /// Validates length (50-10K chars) and checks for URL patterns.
  void setTextValue(String text) {
    final trimmedText = text.trim();

    if (trimmedText.isEmpty) {
      state = const AddRecipeState(inputMode: AddRecipeInputMode.text);
      return;
    }

    // Check for URL in text
    if (_containsUrl(trimmedText)) {
      state = state.copyWith(
        textValue: trimmedText,
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.urlDetected,
        errorMessage: 'Please enter recipe text, not a URL',
      );
      return;
    }

    // Check length constraints
    if (trimmedText.length < minTextLength) {
      state = state.copyWith(
        textValue: trimmedText,
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.textTooShort,
        errorMessage: 'Recipe text must be at least $minTextLength characters',
      );
      return;
    }

    if (trimmedText.length > maxTextLength) {
      state = state.copyWith(
        textValue: trimmedText,
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.textTooLong,
        errorMessage: 'Recipe text must be less than $maxTextLength characters',
      );
      return;
    }

    // Valid text
    state = state.copyWith(
      textValue: trimmedText,
      status: AddRecipeStatus.empty,
      errorCode: AddRecipeErrorCode.unknown,
      errorMessage: '',
    );
  }

  /// Submits the form to create a new recipe.
  ///
  /// Routes to the appropriate repository method based on input mode.
  /// Updates state throughout the workflow: fetching -> parsing -> success/error.
  /// Note: Manual mode is handled by ManualRecipeForm internally.
  Future<void> submit() async {
    if (state.inputMode == AddRecipeInputMode.text) {
      await _submitText();
    } else if (state.inputMode == AddRecipeInputMode.manual) {
      // Manual mode is handled by ManualRecipeForm - this should not be called
      return;
    } else {
      await _submitUrl();
    }
  }

  /// Submits URL to create a new recipe.
  Future<void> _submitUrl() async {
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

  /// Submits text to create a new recipe.
  Future<void> _submitText() async {
    final text = state.textValue.trim();

    // Validate text before submission (should already be valid from setTextValue)
    if (text.isEmpty || text.length < minTextLength) {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.textTooShort,
        errorMessage: 'Recipe text must be at least $minTextLength characters',
      );
      return;
    }

    if (text.length > maxTextLength) {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.textTooLong,
        errorMessage: 'Recipe text must be less than $maxTextLength characters',
      );
      return;
    }

    if (_containsUrl(text)) {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.urlDetected,
        errorMessage: 'Please enter recipe text, not a URL',
      );
      return;
    }

    // Start parsing
    state = state.copyWith(status: AddRecipeStatus.parsing, errorMessage: '');

    try {
      // Call repository to create recipe from text
      final recipe = await _repository.createRecipeFromText(text);

      state = state.copyWith(status: AddRecipeStatus.success, result: recipe);
    } on ValidationException catch (e) {
      final errorCode = _mapValidationExceptionToErrorCode(e);
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: errorCode,
        errorMessage: e.message,
      );
    } on ParseException catch (e) {
      final errorCode = _mapParseExceptionToErrorCode(e);
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: errorCode,
        errorMessage: e.message,
      );
    } on DatabaseException {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.unknown,
        errorMessage: 'Failed to save recipe. Please try again.',
      );
    } catch (e) {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.unknown,
        errorMessage: 'An unexpected error occurred. Please try again.',
      );
    }
  }

  /// Submits a manually created recipe.
  Future<Recipe?> submitManual() async {
    final manualState = ref.read(manualRecipeProvider);

    // Validate manual form state
    if (manualState.title.trim().isEmpty ||
        manualState.ingredients.isEmpty ||
        manualState.instructions.isEmpty) {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.unknown,
        errorMessage: 'Please fill in all required fields',
      );
      return null;
    }

    // Start submitting
    state = state.copyWith(status: AddRecipeStatus.parsing, errorMessage: '');

    try {
      // Convert StepInput list to String list
      final instructionStrings = manualState.instructions
          .map((step) => step.instruction)
          .toList();

      // Create manual recipe input
      final input = ManualRecipeInput(
        title: manualState.title.trim(),
        ingredients: manualState.ingredients,
        instructions: instructionStrings,
      );

      // Call repository to create manual recipe
      final recipe = await _repository.createManualRecipe(input);

      state = state.copyWith(status: AddRecipeStatus.success, result: recipe);
      return recipe;
    } on DatabaseException {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.unknown,
        errorMessage: 'Failed to save recipe. Please try again.',
      );
      return null;
    } catch (e) {
      state = state.copyWith(
        status: AddRecipeStatus.error,
        errorCode: AddRecipeErrorCode.unknown,
        errorMessage: 'An unexpected error occurred. Please try again.',
      );
      return null;
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

  /// Checks if text contains a URL pattern.
  bool _containsUrl(String text) {
    return _urlRegex.hasMatch(text);
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
      case ErrorCode.textTooShort:
        return AddRecipeErrorCode.textTooShort;
      case ErrorCode.textTooLong:
        return AddRecipeErrorCode.textTooLong;
      case ErrorCode.urlDetectedInText:
        return AddRecipeErrorCode.urlDetected;
    }
  }

  /// Maps [ValidationException] to [AddRecipeErrorCode].
  AddRecipeErrorCode _mapValidationExceptionToErrorCode(ValidationException e) {
    if (e.errorCode == null) {
      return AddRecipeErrorCode.unknown;
    }
    switch (e.errorCode!) {
      case ErrorCode.invalidUrl:
        return AddRecipeErrorCode.invalidUrl;
      case ErrorCode.fetchFailed:
        return AddRecipeErrorCode.fetchFailed;
      case ErrorCode.parseFailed:
        return AddRecipeErrorCode.parseFailed;
      case ErrorCode.rateLimit:
        return AddRecipeErrorCode.rateLimit;
      case ErrorCode.textTooShort:
        return AddRecipeErrorCode.textTooShort;
      case ErrorCode.textTooLong:
        return AddRecipeErrorCode.textTooLong;
      case ErrorCode.urlDetectedInText:
        return AddRecipeErrorCode.urlDetected;
    }
  }
}
