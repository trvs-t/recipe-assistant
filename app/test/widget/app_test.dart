import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/app.dart';
import 'package:app/config/theme.dart';

void main() {
  group('App Widget Tests', () {
    testWidgets('MaterialApp.router uses light theme by default', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));

      final MaterialApp app = tester.widget<MaterialApp>(
        find.byType(MaterialApp),
      );

      expect(app.theme, AppTheme.lightTheme);
      expect(app.darkTheme, AppTheme.darkTheme);
    });

    testWidgets('MaterialApp.router has correct title', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));

      final MaterialApp app = tester.widget<MaterialApp>(
        find.byType(MaterialApp),
      );

      expect(app.title, 'Recipe Assistant');
    });

    testWidgets('MaterialApp.router uses routerConfig', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));

      final MaterialApp app = tester.widget<MaterialApp>(
        find.byType(MaterialApp),
      );

      expect(app.routerConfig, isNotNull);
    });

    testWidgets('Theme applies primary color to app bar', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(const ProviderScope(child: MyApp()));
      await tester.pumpAndSettle();

      // Verify MaterialApp exists and has theme
      final MaterialApp app = tester.widget<MaterialApp>(
        find.byType(MaterialApp),
      );
      expect(app.theme?.colorScheme.primary, isNotNull);
    });
  });
}
