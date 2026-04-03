import 'package:app/core/errors/exceptions.dart';

/// Validates text input for plain text recipe import.
///
/// Throws [ValidationException] with specific [ErrorCode] when validation fails.
/// Returns the sanitized text when validation passes.
///
/// Validation rules:
/// - Text must be between 50 and 10000 characters (inclusive)
/// - Text must not start with a URL (http://, https://, www.)
/// - HTML tags are sanitized/removed before validation
String validateTextInput(String text) {
  // TODO: Implement validation logic
  // This stub always returns empty string to make tests fail
  // (TDD red phase - implementation to come in next task)
  return '';
}
