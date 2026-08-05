import { describe, expect, it } from 'vitest';

import {
  createLocalAutoSignInConfig,
  ensureLocalSession,
  type ILocalAuthGateway,
} from './auth';

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
