import type {
  AuthChangeEvent,
  AuthSession,
  AuthUser,
  Provider,
} from '@supabase/supabase-js';

import type { TypedSupabaseClient } from './supabase';

export interface ILocalAutoSignInEnv {
  VITE_LOCAL_AUTO_SIGN_IN?: string;
  VITE_LOCAL_DEMO_EMAIL?: string;
  VITE_LOCAL_DEMO_PASSWORD?: string;
}

export interface ILocalAutoSignInConfig {
  email: string;
  password: string;
}

export interface ILocalAuthGateway {
  getCurrentUserEmail(): Promise<string | null>;
  signInWithPassword(email: string, password: string): Promise<string>;
}

export type SocialAuthProvider = Extract<Provider, 'github' | 'google'>;

export interface IAuthenticatedUser {
  id: string;
  email: string | null;
}

export interface IAuthGateway {
  getCurrentUser(): Promise<IAuthenticatedUser | null>;
  signInWithPassword(email: string, password: string): Promise<IAuthenticatedUser>;
  signInWithSocial(provider: SocialAuthProvider, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthStateChange(callback: (user: IAuthenticatedUser | null) => void): () => void;
}

export function createLocalAutoSignInConfig(
  env: ILocalAutoSignInEnv,
  isDevelopment: boolean,
): ILocalAutoSignInConfig | null {
  if (!isDevelopment || env.VITE_LOCAL_AUTO_SIGN_IN?.trim().toLowerCase() !== 'true') {
    return null;
  }

  const email: string = env.VITE_LOCAL_DEMO_EMAIL?.trim() ?? '';
  const password: string = env.VITE_LOCAL_DEMO_PASSWORD ?? '';
  if (email.length === 0 || password.length === 0) {
    return null;
  }

  return { email, password };
}

export async function ensureLocalSession(
  gateway: ILocalAuthGateway,
  config: ILocalAutoSignInConfig,
): Promise<string> {
  const existingEmail: string | null = await gateway.getCurrentUserEmail();
  if (existingEmail !== null) {
    return existingEmail;
  }

  return gateway.signInWithPassword(config.email, config.password);
}

function mapAuthUser(user: AuthUser | null): IAuthenticatedUser | null {
  return user === null ? null : { id: user.id, email: user.email ?? null };
}

function mapAuthSession(session: AuthSession | null): IAuthenticatedUser | null {
  return mapAuthUser(session?.user ?? null);
}

export function createSupabaseAuthGateway(client: TypedSupabaseClient): IAuthGateway {
  return {
    async getCurrentUser(): Promise<IAuthenticatedUser | null> {
      const result = await client.auth.getSession();
      if (result.error !== null) {
        throw new Error(`Unable to restore your session: ${result.error.message}`);
      }

      return mapAuthSession(result.data.session);
    },
    async signInWithPassword(email: string, password: string): Promise<IAuthenticatedUser> {
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error !== null) {
        throw new Error(`Unable to sign in: ${result.error.message}`);
      }

      const user: IAuthenticatedUser | null = mapAuthUser(result.data.user);
      if (user === null) {
        throw new Error('Sign-in did not return an authenticated user.');
      }

      return user;
    },
    async signInWithSocial(provider: SocialAuthProvider, redirectTo: string): Promise<void> {
      const result = await client.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (result.error !== null) {
        throw new Error(`Unable to start ${provider} sign-in: ${result.error.message}`);
      }
    },
    async signOut(): Promise<void> {
      const result = await client.auth.signOut();
      if (result.error !== null) {
        throw new Error(`Unable to sign out: ${result.error.message}`);
      }
    },
    onAuthStateChange(callback: (user: IAuthenticatedUser | null) => void): () => void {
      const subscription = client.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: AuthSession | null): void => {
          callback(mapAuthSession(session));
        },
      );
      return (): void => subscription.data.subscription.unsubscribe();
    },
  };
}

export function createSupabaseLocalAuthGateway(client: TypedSupabaseClient): ILocalAuthGateway {
  return {
    async getCurrentUserEmail(): Promise<string | null> {
      const result = await client.auth.getSession();
      if (result.error !== null) {
        throw new Error(`Unable to restore the local session: ${result.error.message}`);
      }

      return result.data.session?.user.email ?? null;
    },
    async signInWithPassword(email: string, password: string): Promise<string> {
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error !== null) {
        throw new Error(`Unable to sign in to local development: ${result.error.message}`);
      }

      const authenticatedEmail: string | undefined = result.data.user.email;
      if (authenticatedEmail === undefined || authenticatedEmail.length === 0) {
        throw new Error('Local development sign-in returned a user without an email address.');
      }

      return authenticatedEmail;
    },
  };
}

export const localAutoSignInConfig: ILocalAutoSignInConfig | null = createLocalAutoSignInConfig(
  {
    VITE_LOCAL_AUTO_SIGN_IN: import.meta.env.VITE_LOCAL_AUTO_SIGN_IN,
    VITE_LOCAL_DEMO_EMAIL: import.meta.env.VITE_LOCAL_DEMO_EMAIL,
    VITE_LOCAL_DEMO_PASSWORD: import.meta.env.VITE_LOCAL_DEMO_PASSWORD,
  },
  import.meta.env.DEV,
);
