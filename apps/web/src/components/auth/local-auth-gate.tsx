import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { GoogleLoginForm } from '@/components/auth/google-login-form';
import { Card } from '@/components/ui/card';
import {
  createSupabaseAuthGateway,
  createSupabaseLocalAuthGateway,
  ensureLocalSession,
  localAutoSignInConfig,
  type IAuthenticatedUser,
  type IAuthGateway,
} from '@/lib/auth';
import { supabaseAdapter } from '@/lib/supabase';

interface IAuthContext {
  enabled: boolean;
  email: string | null;
  pending: boolean;
  actionPending: boolean;
  error: string | null;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
}

interface IAuthGateProps {
  children: ReactNode;
}

interface IAuthState {
  user: IAuthenticatedUser | null;
  error: string | null;
  pending: boolean;
  actionPending: boolean;
}

const defaultAuthContext: IAuthContext = {
  enabled: false,
  email: null,
  pending: false,
  actionPending: false,
  error: null,
  signInWithGoogle: async (): Promise<void> => undefined,
  signOut: async (): Promise<void> => undefined,
};

const AuthContext = createContext<IAuthContext>(defaultAuthContext);
let localSignInPromise: Promise<string> | null = null;

export function AuthGate({ children }: IAuthGateProps): ReactElement {
  const authenticationEnabled: boolean = supabaseAdapter.mode === 'remote';
  const client = supabaseAdapter.client;
  const gateway: IAuthGateway | null = useMemo(
    (): IAuthGateway | null => client === null ? null : createSupabaseAuthGateway(client),
    [client],
  );
  const [state, setState] = useState<IAuthState>({
    user: null,
    error: null,
    pending: authenticationEnabled,
    actionPending: false,
  });

  useEffect((): (() => void) | undefined => {
    if (!authenticationEnabled || gateway === null || client === null) {
      setState({ user: null, error: null, pending: false, actionPending: false });
      return undefined;
    }

    let active: boolean = true;
    const unsubscribe: () => void = gateway.onAuthStateChange((user: IAuthenticatedUser | null): void => {
      if (active) {
        setState({ user, error: null, pending: false, actionPending: false });
      }
    });

    const restoreSession = async (): Promise<void> => {
      try {
        let user: IAuthenticatedUser | null = await gateway.getCurrentUser();
        if (user === null && localAutoSignInConfig !== null) {
          localSignInPromise ??= ensureLocalSession(
            createSupabaseLocalAuthGateway(client),
            localAutoSignInConfig,
          );
          await localSignInPromise;
          localSignInPromise = null;
          user = await gateway.getCurrentUser();
          if (user === null) {
            throw new Error('Local automatic sign-in did not return an authenticated session.');
          }
        }

        if (active) {
          setState({ user, error: null, pending: false, actionPending: false });
        }
      } catch (error: unknown) {
        localSignInPromise = null;
        if (active) {
          setState({
            user: null,
            error: error instanceof Error ? error.message : 'Unable to restore your session.',
            pending: false,
            actionPending: false,
          });
        }
      }
    };

    void restoreSession();
    return (): void => {
      active = false;
      unsubscribe();
    };
  }, [authenticationEnabled, client, gateway]);

  const signInWithGoogle = async (): Promise<void> => {
    if (gateway === null) {
      return;
    }

    setState((current: IAuthState): IAuthState => ({ ...current, error: null, actionPending: true }));
    try {
      await gateway.signInWithGoogle(window.location.origin);
    } catch (error: unknown) {
      setState((current: IAuthState): IAuthState => ({
        ...current,
        error: error instanceof Error ? error.message : 'Unable to start Google sign-in.',
        actionPending: false,
      }));
    }
  };

  const signOut = async (): Promise<void> => {
    if (gateway === null) {
      return;
    }

    setState((current: IAuthState): IAuthState => ({ ...current, error: null, actionPending: true }));
    try {
      await gateway.signOut();
      setState({ user: null, error: null, pending: false, actionPending: false });
    } catch (error: unknown) {
      setState((current: IAuthState): IAuthState => ({
        ...current,
        error: error instanceof Error ? error.message : 'Unable to sign out.',
        actionPending: false,
      }));
    }
  };

  const context: IAuthContext = useMemo(
    (): IAuthContext => ({
      enabled: authenticationEnabled,
      email: state.user?.email ?? null,
      pending: state.pending,
      actionPending: state.actionPending,
      error: state.error,
      signInWithGoogle,
      signOut,
    }),
    [authenticationEnabled, signInWithGoogle, signOut, state],
  );

  if (state.pending) {
    return <AuthStatus message="Checking your session…" />;
  }

  if (authenticationEnabled && state.user === null) {
    return (
      <AuthContext.Provider value={context}>
        <GoogleLoginForm
          error={state.error}
          onSignIn={signInWithGoogle}
          pending={state.actionPending}
        />
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={context}>{children}</AuthContext.Provider>;
}

/** Kept as an alias for callers that still use the old development-only name. */
export function LocalAuthGate({ children }: IAuthGateProps): ReactElement {
  return <AuthGate>{children}</AuthGate>;
}

export function useAuth(): IAuthContext {
  return useContext(AuthContext);
}

export function useLocalAuthenticatedEmail(): string | null {
  return useAuth().email;
}

function AuthStatus({ message }: { message: string }): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <Card className="max-w-lg p-6 text-sm text-[var(--muted-foreground)]" role="status">
        {message}
      </Card>
    </main>
  );
}
