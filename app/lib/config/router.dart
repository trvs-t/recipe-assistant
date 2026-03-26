import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../presentation/pages/recipe_list_page.dart';
import '../presentation/pages/recipe_detail_page.dart';
import '../presentation/pages/add_recipe_page.dart';

/// Application route paths
class AppRoutes {
  AppRoutes._();

  /// Home route - Recipe list
  static const String home = '/';

  /// Recipe detail route with :id parameter
  static const String recipeDetail = '/recipe/:id';

  /// Add recipe route
  static const String addRecipe = '/add';

  /// Build recipe detail path with actual ID
  static String recipeDetailPath(String id) => '/recipe/$id';
}

/// Application router configuration
final router = GoRouter(
  initialLocation: AppRoutes.home,
  debugLogDiagnostics: true,
  routes: [
    GoRoute(
      path: AppRoutes.home,
      builder: (BuildContext context, GoRouterState state) {
        return const RecipeListPage();
      },
    ),
    GoRoute(
      path: AppRoutes.recipeDetail,
      builder: (BuildContext context, GoRouterState state) {
        final String id = state.pathParameters['id']!;
        return RecipeDetailPage(id: id);
      },
    ),
    GoRoute(
      path: AppRoutes.addRecipe,
      builder: (BuildContext context, GoRouterState state) {
        return const AddRecipePage();
      },
    ),
  ],
);

/// Navigation helper extension on BuildContext
extension NavigationHelpers on BuildContext {
  /// Navigate to home/recipe list
  void goHome() => go(AppRoutes.home);

  /// Navigate to recipe detail page
  void goRecipeDetail(String id) => go(AppRoutes.recipeDetailPath(id));

  /// Navigate to add recipe page
  void goAddRecipe() => go(AppRoutes.addRecipe);

  /// Push recipe detail page onto navigation stack
  void pushRecipeDetail(String id) => push(AppRoutes.recipeDetailPath(id));

  /// Push add recipe page onto navigation stack
  void pushAddRecipe() => push(AppRoutes.addRecipe);
}
