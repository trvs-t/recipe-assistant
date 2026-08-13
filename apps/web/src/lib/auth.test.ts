import type { AuthSession, AuthUser } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  createLocalAutoSignInConfig,
  createSupabaseAuthGateway,
  ensureLocalSession,
  type ILocalAuthGateway,
} from './auth';

import type { TypedSupabaseClient } from './supabase';

interface IFakeAuthState {
  email: string | null;
  signInCount: number;
}

function createAuthGateway(state: IFakeAuthState): ILocalAuthGateway {
  return {
    async getCurrentUserEmail(): Promise<string | null> {
      return state.email;
    },
    async signInWithPassword(email: string, _password: string): Promise<string> {
      state.signInCount += 1;
      state.email = email;
      return email;
    },
  };
}

describe('local automatic authentication', (): void => {
  it('requires development mode, an explicit flag, and demo credentials', (): void => {
    const env = {
      VITE_LOCAL_AUTO_SIGN_IN: 'true',
      VITE_LOCAL_DEMO_EMAIL: 'dev@example.com',
      VITE_LOCAL_DEMO_PASSWORD: 'devpassword123',
    };

    expect(createLocalAutoSignInConfig(env, true)).toEqual({
      email: 'dev@example.com',
      password: 'devpassword123',
    });
    expect(createLocalAutoSignInConfig(env, false)).toBeNull();
    expect(createLocalAutoSignInConfig({ ...env, VITE_LOCAL_AUTO_SIGN_IN: 'false' }, true)).toBeNull();
    expect(createLocalAutoSignInConfig({ VITE_LOCAL_AUTO_SIGN_IN: 'true' }, true)).toBeNull();
  });

  it('keeps an existing session instead of signing in again', async (): Promise<void> => {
    const state: IFakeAuthState = { email: 'already@example.com', signInCount: 0 };
    const email: string = await ensureLocalSession(createAuthGateway(state), {
      email: 'dev@example.com',
      password: 'devpassword123',
    });

    expect(email).toBe('already@example.com');
    expect(state.signInCount).toBe(0);
  });

  it('signs in with the configured local demo account when no session exists', async (): Promise<void> => {
    const state: IFakeAuthState = { email: null, signInCount: 0 };
    const email: string = await ensureLocalSession(createAuthGateway(state), {
      email: 'dev@example.com',
      password: 'devpassword123',
    });

    expect(email).toBe('dev@example.com');
    expect(state.signInCount).toBe(1);
  });
});

describe('Supabase authentication gateway', (): void => {
  it('supports Google sign-in, auth events, and sign-out', async (): Promise<void> => {
    const user: AuthUser = { id: 'user-1', email: 'cook@example.com' } as unknown as AuthUser;
    const authState = {
      callback: null as ((event: string, session: AuthSession | null) => void) | null,
    };
    const unsubscribe = vi.fn();
    const fakeClient: TypedSupabaseClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
        signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: 'google', url: null }, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        onAuthStateChange: vi.fn().mockImplementation(
          (callback: (event: string, session: AuthSession | null) => void) => {
            authState.callback = callback;
            return { data: { subscription: { unsubscribe } } };
          },
        ),
      },
    } as unknown as TypedSupabaseClient;
    const gateway = createSupabaseAuthGateway(fakeClient);

    await gateway.signInWithGoogle('https://recipes.example.com/');
    await gateway.signOut();

    const receivedUsers: Array<{ id: string; email: string | null } | null> = [];
    const stopListening: () => void = gateway.onAuthStateChange((nextUser) => {
      receivedUsers.push(nextUser);
    });
    const authStateCallback: ((event: string, session: AuthSession | null) => void) | null = authState.callback;
    if (authStateCallback === null) {
      throw new Error('The fake auth client did not register a listener.');
    }
    authStateCallback('SIGNED_IN', { user } as unknown as AuthSession);
    authStateCallback('SIGNED_OUT', null);
    stopListening();

    expect(receivedUsers).toEqual([
      { id: 'user-1', email: 'cook@example.com' },
      null,
    ]);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
