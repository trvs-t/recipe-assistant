import 'package:flutter_test/flutter_test.dart';

import 'package:app/core/errors/exceptions.dart';

// Import the validation function that will be implemented later
// This import will fail initially since the function doesn't exist yet
import 'package:app/data/validation/text_input_validation.dart';

void main() {
  group('Text Input Validation', () {
    group('validateTextInput', () {
      test(
        'returns ValidationException with textTooShort when text is less than 50 characters',
        () {
          // Arrange
          const shortText = 'This is a short text';

          // Act & Assert
          expect(
            () => validateTextInput(shortText),
            throwsA(
              isA<ValidationException>().having(
                (e) => e.errorCode,
                'errorCode',
                ErrorCode.textTooShort,
              ),
            ),
          );
        },
      );

      test(
        'returns ValidationException with textTooLong when text is more than 10000 characters',
        () {
          // Arrange
          final longText = 'A' * 10001;

          // Act & Assert
          expect(
            () => validateTextInput(longText),
            throwsA(
              isA<ValidationException>().having(
                (e) => e.errorCode,
                'errorCode',
                ErrorCode.textTooLong,
              ),
            ),
          );
        },
      );

      test(
        'returns ValidationException with urlDetectedInText when text starts with URL',
        () {
          // Arrange
          const textWithUrl =
              'https://example.com/recipe This is a recipe text';

          // Act & Assert
          expect(
            () => validateTextInput(textWithUrl),
            throwsA(
              isA<ValidationException>().having(
                (e) => e.errorCode,
                'errorCode',
                ErrorCode.urlDetectedInText,
              ),
            ),
          );
        },
      );

      test('returns sanitized text when input contains HTML tags', () {
        // Arrange
        final validText = 'A' * 100; // Valid length text
        final htmlText = '<p>$validText</p>';

        // Act
        final result = validateTextInput(htmlText);

        // Assert
        expect(result, equals(validText));
        expect(result, isNot(contains('<')));
        expect(result, isNot(contains('>')));
      });

      test(
        'returns text unchanged when text is between 50 and 10000 characters',
        () {
          // Arrange
          final validText =
              'This is a valid recipe text. ' * 10; // 290 characters

          // Act
          final result = validateTextInput(validText);

          // Assert
          expect(result, equals(validText));
        },
      );

      test('accepts text with exactly 50 characters', () {
        // Arrange
        final exactMinText = 'A' * 50;

        // Act
        final result = validateTextInput(exactMinText);

        // Assert
        expect(result, equals(exactMinText));
      });

      test('accepts text with exactly 10000 characters', () {
        // Arrange
        final exactMaxText = 'B' * 10000;

        // Act
        final result = validateTextInput(exactMaxText);

        // Assert
        expect(result, equals(exactMaxText));
      });

      test('throws urlDetectedInText for text starting with http://', () {
        // Arrange
        const textWithHttp = 'http://example.com Some recipe text here';

        // Act & Assert
        expect(
          () => validateTextInput(textWithHttp),
          throwsA(
            isA<ValidationException>().having(
              (e) => e.errorCode,
              'errorCode',
              ErrorCode.urlDetectedInText,
            ),
          ),
        );
      });

      test('throws urlDetectedInText for text starting with www.', () {
        // Arrange
        const textWithWww = 'www.example.com Some recipe text here';

        // Act & Assert
        expect(
          () => validateTextInput(textWithWww),
          throwsA(
            isA<ValidationException>().having(
              (e) => e.errorCode,
              'errorCode',
              ErrorCode.urlDetectedInText,
            ),
          ),
        );
      });
    });
  });
}
