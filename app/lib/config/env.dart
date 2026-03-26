import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Environment configuration for the app.
/// Load with: `await dotenv.load(fileName: ".env");` in main.dart
class Env {
  static String get supabaseUrl => _get('SUPABASE_URL');
  static String get supabaseAnonKey => _get('SUPABASE_ANON_KEY');
  static String get openAiApiKey => _get('OPENAI_API_KEY');

  static String _get(String key) {
    final value = dotenv.env[key];
    if (value == null || value.isEmpty) {
      throw StateError('Missing required environment variable: $key');
    }
    return value;
  }
}
