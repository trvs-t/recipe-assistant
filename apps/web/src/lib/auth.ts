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
