/// Error codes for recipe-related exceptions.
enum ErrorCode {
  /// Invalid URL format provided.
  invalidUrl,

  /// Failed to fetch content from URL.
  fetchFailed,

  /// Failed to parse recipe content.
  parseFailed,

  /// Rate limit exceeded.
  rateLimit,

  /// Text input is too short.
  textTooShort,

  /// Text input is too long.
  textTooLong,

  /// URL detected in text input.
  urlDetectedInText,
}

/// Base exception class for all recipe-related errors.
abstract class RecipeException implements Exception {
  /// Creates a [RecipeException] with the given message.
  const RecipeException(this.message);

  /// The error message describing what went wrong.
  final String message;

  @override
  String toString() => 'RecipeException: $message';
}

/// Exception thrown when a recipe is not found.
class RecipeNotFoundException extends RecipeException {
  /// Creates a [RecipeNotFoundException] with an optional recipe identifier.
  const RecipeNotFoundException({this.recipeId}) : super('Recipe not found');

  /// The ID of the recipe that was not found, if available.
  final String? recipeId;

  @override
  String toString() {
    if (recipeId != null) {
      return 'RecipeNotFoundException: Recipe with ID "$recipeId" not found';
    }
    return 'RecipeNotFoundException: $message';
  }
}

/// Exception thrown when a network operation fails.
class NetworkException extends RecipeException {
  /// Creates a [NetworkException] with the given message and retryability flag.
  const NetworkException({required String message, required this.retryable})
    : super(message);

  /// Whether this network error can be retried.
  final bool retryable;

  @override
  String toString() => 'NetworkException: $message (retryable: $retryable)';
}

/// Exception thrown when parsing fails.
class ParseException extends RecipeException {
  /// Creates a [ParseException] with the given message and error code.
  const ParseException({required String message, required this.errorCode})
    : super(message);

  /// The specific error code for this parsing failure.
  final ErrorCode errorCode;

  @override
  String toString() => 'ParseException: $message (code: $errorCode)';
}

/// Exception thrown when URL validation fails.
class ValidationException extends RecipeException {
  /// Creates a [ValidationException] with the given message and error code.
  const ValidationException({required String message, this.errorCode})
    : super(message);

  /// The specific error code for this validation failure.
  final ErrorCode? errorCode;

  @override
  String toString() {
    if (errorCode != null) {
      return 'ValidationException: $message (code: $errorCode)';
    }
    return 'ValidationException: $message';
  }
}

/// Exception thrown when a database operation fails.
class DatabaseException extends RecipeException {
  /// Creates a [DatabaseException] with the given message.
  const DatabaseException({required String message}) : super(message);

  @override
  String toString() => 'DatabaseException: $message';
}
