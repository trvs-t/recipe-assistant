import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/errors/exceptions.dart';

void main() {
  group('ErrorCode', () {
    test('should have all required values', () {
      expect(ErrorCode.values.length, equals(4));
      expect(ErrorCode.values, contains(ErrorCode.invalidUrl));
      expect(ErrorCode.values, contains(ErrorCode.fetchFailed));
      expect(ErrorCode.values, contains(ErrorCode.parseFailed));
      expect(ErrorCode.values, contains(ErrorCode.rateLimit));
    });
  });

  group('RecipeNotFoundException', () {
    test('should create exception without recipeId', () {
      const exception = RecipeNotFoundException();

      expect(exception.message, equals('Recipe not found'));
      expect(exception.recipeId, isNull);
    });

    test('should create exception with recipeId', () {
      const exception = RecipeNotFoundException(recipeId: '123');

      expect(exception.message, equals('Recipe not found'));
      expect(exception.recipeId, equals('123'));
    });

    test('toString should include recipeId when provided', () {
      const exception = RecipeNotFoundException(recipeId: 'abc-123');

      expect(
        exception.toString(),
        equals('RecipeNotFoundException: Recipe with ID "abc-123" not found'),
      );
    });

    test('toString should show message when recipeId is null', () {
      const exception = RecipeNotFoundException();

      expect(
        exception.toString(),
        equals('RecipeNotFoundException: Recipe not found'),
      );
    });
  });

  group('NetworkException', () {
    test('should create retryable exception', () {
      const exception = NetworkException(
        message: 'Connection timeout',
        retryable: true,
      );

      expect(exception.message, equals('Connection timeout'));
      expect(exception.retryable, isTrue);
    });

    test('should create non-retryable exception', () {
      const exception = NetworkException(
        message: 'Invalid certificate',
        retryable: false,
      );

      expect(exception.message, equals('Invalid certificate'));
      expect(exception.retryable, isFalse);
    });

    test('toString should include retryable flag', () {
      const exception = NetworkException(
        message: 'Server error',
        retryable: true,
      );

      expect(
        exception.toString(),
        equals('NetworkException: Server error (retryable: true)'),
      );
    });
  });

  group('ParseException', () {
    test('should create exception with error code', () {
      const exception = ParseException(
        message: 'Failed to parse HTML',
        errorCode: ErrorCode.parseFailed,
      );

      expect(exception.message, equals('Failed to parse HTML'));
      expect(exception.errorCode, equals(ErrorCode.parseFailed));
    });

    test('toString should include error code', () {
      const exception = ParseException(
        message: 'Invalid recipe format',
        errorCode: ErrorCode.parseFailed,
      );

      expect(
        exception.toString(),
        equals(
          'ParseException: Invalid recipe format (code: ErrorCode.parseFailed)',
        ),
      );
    });

    test('should work with all error codes', () {
      for (final code in ErrorCode.values) {
        final exception = ParseException(
          message: 'Test message',
          errorCode: code,
        );
        expect(exception.errorCode, equals(code));
      }
    });
  });

  group('ValidationException', () {
    test('should create exception with message', () {
      const exception = ValidationException(
        message: 'URL must start with http:// or https://',
      );

      expect(
        exception.message,
        equals('URL must start with http:// or https://'),
      );
    });

    test('toString should include message', () {
      const exception = ValidationException(message: 'Invalid URL format');

      expect(
        exception.toString(),
        equals('ValidationException: Invalid URL format'),
      );
    });
  });

  group('RecipeException inheritance', () {
    test('all exceptions should implement Exception', () {
      expect(const RecipeNotFoundException(), isA<Exception>());
      expect(
        const NetworkException(message: 'test', retryable: false),
        isA<Exception>(),
      );
      expect(
        const ParseException(message: 'test', errorCode: ErrorCode.parseFailed),
        isA<Exception>(),
      );
      expect(const ValidationException(message: 'test'), isA<Exception>());
    });

    test('all exceptions should extend RecipeException', () {
      expect(const RecipeNotFoundException(), isA<RecipeException>());
      expect(
        const NetworkException(message: 'test', retryable: false),
        isA<RecipeException>(),
      );
      expect(
        const ParseException(message: 'test', errorCode: ErrorCode.parseFailed),
        isA<RecipeException>(),
      );
      expect(
        const ValidationException(message: 'test'),
        isA<RecipeException>(),
      );
    });
  });
}
