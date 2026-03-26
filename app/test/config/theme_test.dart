import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/config/theme.dart';

void main() {
  group('AppTheme', () {
    test('lightTheme should return valid ThemeData', () {
      final ThemeData theme = AppTheme.lightTheme;
      expect(theme, isNotNull);
      expect(theme.brightness, Brightness.light);
    });

    test('darkTheme should return valid ThemeData', () {
      final ThemeData theme = AppTheme.darkTheme;
      expect(theme, isNotNull);
      expect(theme.brightness, Brightness.dark);
    });

    test('lightTheme should have Material3 enabled', () {
      final ThemeData theme = AppTheme.lightTheme;
      expect(theme.useMaterial3, isTrue);
    });

    test('darkTheme should have Material3 enabled', () {
      final ThemeData theme = AppTheme.darkTheme;
      expect(theme.useMaterial3, isTrue);
    });

    test('lightTheme should have color scheme', () {
      final ThemeData theme = AppTheme.lightTheme;
      expect(theme.colorScheme, isNotNull);
    });

    test('darkTheme should have color scheme', () {
      final ThemeData theme = AppTheme.darkTheme;
      expect(theme.colorScheme, isNotNull);
    });

    test('lightTheme should have text theme', () {
      final ThemeData theme = AppTheme.lightTheme;
      expect(theme.textTheme, isNotNull);
      expect(theme.textTheme.displayLarge, isNotNull);
      expect(theme.textTheme.headlineLarge, isNotNull);
      expect(theme.textTheme.bodyLarge, isNotNull);
    });

    test('darkTheme should have text theme', () {
      final ThemeData theme = AppTheme.darkTheme;
      expect(theme.textTheme, isNotNull);
      expect(theme.textTheme.displayLarge, isNotNull);
      expect(theme.textTheme.headlineLarge, isNotNull);
      expect(theme.textTheme.bodyLarge, isNotNull);
    });

    test('lightTheme should have card theme', () {
      final ThemeData theme = AppTheme.lightTheme;
      expect(theme.cardTheme, isNotNull);
    });

    test('darkTheme should have card theme', () {
      final ThemeData theme = AppTheme.darkTheme;
      expect(theme.cardTheme, isNotNull);
    });

    test('lightTheme should have app bar theme', () {
      final ThemeData theme = AppTheme.lightTheme;
      expect(theme.appBarTheme, isNotNull);
    });

    test('darkTheme should have app bar theme', () {
      final ThemeData theme = AppTheme.darkTheme;
      expect(theme.appBarTheme, isNotNull);
    });

    test('lightTheme should have input decoration theme', () {
      final ThemeData theme = AppTheme.lightTheme;
      expect(theme.inputDecorationTheme, isNotNull);
    });

    test('darkTheme should have input decoration theme', () {
      final ThemeData theme = AppTheme.darkTheme;
      expect(theme.inputDecorationTheme, isNotNull);
    });

    test('lightTheme should have elevated button theme', () {
      final ThemeData theme = AppTheme.lightTheme;
      expect(theme.elevatedButtonTheme, isNotNull);
    });

    test('darkTheme should have elevated button theme', () {
      final ThemeData theme = AppTheme.darkTheme;
      expect(theme.elevatedButtonTheme, isNotNull);
    });
  });
}
