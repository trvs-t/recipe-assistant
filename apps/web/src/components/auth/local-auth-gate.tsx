import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createSupabaseAuthGateway,
  createSupabaseLocalAuthGateway,
  ensureLocalSession,
  localAutoSignInConfig,
  type IAuthenticatedUser,
  type IAuthGateway,
  type SocialAuthProvider,
} from '@/lib/auth';
import { supabaseAdapter } from '@/lib/supabase';

interface IAuthContext {
  enabled: boolean;
  email: string | null;
  pending: boolean;
  actionPending: boolean;
  error: string | null;
  signInWithPassword(email: string, password: string): Promise<void>;
  signInWithSocial(provider: SocialAuthProvider): Promise<void>;
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

interface ISignInPanelProps {
  error: string | null;
  pending: boolean;
  onSignInWithPassword(email: string, password: string): Promise<void>;
  onSignInWithSocial(provider: SocialAuthProvider): Promise<void>;
}

const defaultAuthContext: IAuthContext = {
  enabled: false,
  email: null,
  pending: false,
  actionPending: false,
  error: null,
  signInWithPassword: async (): Promise<void> => undefined,
  signInWithSocial: async (): Promise<void> => undefined,
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

  const signInWithPassword = async (email: string, password: string): Promise<void> => {
    if (gateway === null) {
      return;
    }

    setState((current: IAuthState): IAuthState => ({ ...current, error: null, actionPending: true }));
    try {
      const user: IAuthenticatedUser = await gateway.signInWithPassword(email.trim(), password);
      setState({ user, error: null, pending: false, actionPending: false });
    } catch (error: unknown) {
      setState((current: IAuthState): IAuthState => ({
        ...current,
        error: error instanceof Error ? error.message : 'Unable to sign in.',
        actionPending: false,
      }));
    }
  };

  const signInWithSocial = async (provider: SocialAuthProvider): Promise<void> => {
    if (gateway === null) {
      return;
    }

    setState((current: IAuthState): IAuthState => ({ ...current, error: null, actionPending: true }));
    try {
      await gateway.signInWithSocial(provider, window.location.href);
    } catch (error: unknown) {
      setState((current: IAuthState): IAuthState => ({
        ...current,
        error: error instanceof Error ? error.message : `Unable to start ${provider} sign-in.`,
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
      signInWithPassword,
      signInWithSocial,
      signOut,
    }),
    [authenticationEnabled, signInWithPassword, signInWithSocial, signOut, state],
  );

  if (state.pending) {
    return <AuthStatus message="Checking your session…" />;
  }

  if (authenticationEnabled && state.user === null) {
    return (
      <AuthContext.Provider value={context}>
        <SignInPanel
          error={state.error}
          onSignInWithPassword={signInWithPassword}
          onSignInWithSocial={signInWithSocial}
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

function SignInPanel({ error, onSignInWithPassword, onSignInWithSocial, pending }: ISignInPanelProps): ReactElement {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const normalizedEmail: string = email.trim();
    if (normalizedEmail.length === 0 || password.length === 0) {
      setValidationMessage('Enter your email and password to continue.');
      return;
    }

    setValidationMessage(null);
    await onSignInWithPassword(normalizedEmail, password);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary)]">Recipe Collector</p>
          <CardTitle className="text-3xl">Welcome back</CardTitle>
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">
            Sign in to keep your recipe library private and available across devices.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(event: FormEvent<HTMLFormElement>): void => void handleSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                autoComplete="email"
                id="auth-email"
                onChange={(event): void => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                autoComplete="current-password"
                id="auth-password"
                onChange={(event): void => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            {validationMessage !== null || error !== null ? (
              <p className="text-sm text-[var(--destructive)]" role="alert">
                {validationMessage ?? error}
              </p>
            ) : null}
            <Button className="w-full" disabled={pending} type="submit">
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span>or continue with</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              className="w-full"
              disabled={pending}
              onClick={(): void => void onSignInWithSocial('google')}
              variant="outline"
            >
              Google
            </Button>
            <Button
              className="w-full"
              disabled={pending}
              onClick={(): void => void onSignInWithSocial('github')}
              variant="outline"
            >
              GitHub
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
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
