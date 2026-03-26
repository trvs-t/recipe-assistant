import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Page for adding a new recipe via URL
class AddRecipePage extends StatelessWidget {
  /// Creates a new add recipe page
  const AddRecipePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Recipe'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.pop(),
        ),
      ),
      body: const Padding(
        padding: EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              decoration: InputDecoration(
                labelText: 'Recipe URL',
                hintText: 'https://example.com/recipe',
                prefixIcon: Icon(Icons.link),
              ),
              keyboardType: TextInputType.url,
            ),
            SizedBox(height: 16),
            ElevatedButton(
              onPressed: null, // TODO: Implement add functionality
              child: Text('Save Recipe'),
            ),
          ],
        ),
      ),
    );
  }
}
