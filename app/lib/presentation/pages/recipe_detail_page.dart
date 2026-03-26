import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Recipe detail page showing full recipe information
class RecipeDetailPage extends StatelessWidget {
  /// Creates a new recipe detail page
  const RecipeDetailPage({super.key, required this.id});

  /// Recipe ID from route parameters
  final String id;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Recipe Details'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
      ),
      body: Center(child: Text('Recipe Details for ID: $id')),
    );
  }
}
