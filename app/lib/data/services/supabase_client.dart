import 'package:flutter/foundation.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

part 'supabase_client.g.dart';

/// Supabase client provider with Riverpod code generation.
///
/// This provider initializes the Supabase client from environment variables
/// and handles dev user sign-in for development purposes.
///
/// Usage:
/// ```dart
/// final client = ref.watch(supabaseClientProvider);
/// ```
@riverpod
SupabaseClient supabaseClient(Ref ref) {
  // Ensure Supabase is initialized before accessing the client
  final instance = Supabase.instance;
  if (!instance.isInitialized) {
    throw StateError(
      'Supabase has not been initialized. '
      'Call Supabase.initialize() in main.dart before accessing the client.',
    );
  }
  return instance.client;
}

/// Supabase initialization helper class.
///
/// This class handles the initialization of Supabase from environment variables.
/// It should be called in main.dart before running the app.
class SupabaseInitializer {
  /// Initialize Supabase with environment variables.
  ///
  /// Must be called after loading .env file with `await dotenv.load()`.
  ///
  /// Throws [StateError] if required environment variables are missing.
  static Future<void> initialize() async {
    final url = dotenv.env['SUPABASE_URL'];
    final anonKey = dotenv.env['SUPABASE_ANON_KEY'];

    if (url == null || url.isEmpty) {
      throw StateError(
        'Missing required environment variable: SUPABASE_URL. '
        'Ensure .env file is loaded and contains SUPABASE_URL.',
      );
    }

    if (anonKey == null || anonKey.isEmpty) {
      throw StateError(
        'Missing required environment variable: SUPABASE_ANON_KEY. '
        'Ensure .env file is loaded and contains SUPABASE_ANON_KEY.',
      );
    }

    await Supabase.initialize(url: url, anonKey: anonKey, debug: kDebugMode);

    // Dev user sign-in for development environment
    await _signInDevUser();
  }

  /// Sign in the development user for local development.
  ///
  /// This is only for development purposes and uses the dev user
  /// credentials from the Supabase seed.
  static Future<void> _signInDevUser() async {
    try {
      final auth = Supabase.instance.client.auth;

      // Check if already signed in
      final currentSession = auth.currentSession;
      if (currentSession != null) {
        debugPrint(
          'Supabase: Already signed in as ${currentSession.user.email}',
        );
        return;
      }

      // Sign in with dev credentials
      await auth.signInWithPassword(
        email: 'dev@example.com',
        password: 'devpassword123',
      );
      debugPrint('Supabase: Dev user signed in successfully');
    } catch (e) {
      // Log but don't throw - this allows the app to continue
      // even if dev sign-in fails (e.g., wrong credentials or network issues)
      debugPrint('Supabase: Dev sign-in failed: $e');
    }
  }
}

/// Auth state provider for tracking authentication changes.
///
/// This provider streams the current authentication state.
@riverpod
Stream<AuthState> authState(Ref ref) {
  final client = ref.watch(supabaseClientProvider);
  return client.auth.onAuthStateChange;
}

/// Current user provider.
///
/// Returns the currently authenticated user or null if not signed in.
@riverpod
User? currentUser(Ref ref) {
  final client = ref.watch(supabaseClientProvider);
  return client.auth.currentUser;
}

/// Current session provider.
///
/// Returns the current session or null if not signed in.
@riverpod
Session? currentSession(Ref ref) {
  final client = ref.watch(supabaseClientProvider);
  return client.auth.currentSession;
}
