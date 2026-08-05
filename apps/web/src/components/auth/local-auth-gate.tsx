import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Card } from '@/components/ui/card';
import {
  createSupabaseLocalAuthGateway,
  ensureLocalSession,
  localAutoSignInConfig,
} from '@/lib/auth';
import { supabaseAdapter } from '@/lib/supabase';

interface ILocalAuthContext {
  email: string | null;
}

interface ILocalAuthGateProps {
  children: ReactNode;
}

interface ILocalAuthState {
  email: string | null;
  error: string | null;
  pending: boolean;
}

const LocalAuthContext = createContext<ILocalAuthContext>({ email: null });
let localSignInPromise: Promise<string> | null = null;

export function LocalAuthGate({ children }: ILocalAuthGateProps): ReactElement {
  const authenticationEnabled: boolean = localAutoSignInConfig !== null;
  const [state, setState] = useState<ILocalAuthState>({
    email: null,
    error: null,
    pending: authenticationEnabled,
  });

  useEffect((): (() => void) | undefined => {
    if (localAutoSignInConfig === null) {
      return undefined;
    }

    if (supabaseAdapter.client === null) {
      setState({
        email: null,
        error: 'Local automatic sign-in requires valid local Supabase URL and anonymous-key settings.',
        pending: false,
      });
      return undefined;
    }

    let active: boolean = true;
    localSignInPromise ??= ensureLocalSession(
      createSupabaseLocalAuthGateway(supabaseAdapter.client),
      localAutoSignInConfig,
    );
    void localSignInPromise.then(
      (email: string): void => {
        if (active) {
          setState({ email, error: null, pending: false });
        }
      },
      (error: unknown): void => {
        localSignInPromise = null;
        if (active) {
          setState({
            email: null,
            error: error instanceof Error ? error.message : 'Local development sign-in failed.',
            pending: false,
          });
        }
      },
    );

    return (): void => {
      active = false;
    };
  }, []);

  const context: ILocalAuthContext = useMemo(
    (): ILocalAuthContext => ({ email: state.email }),
    [state.email],
  );

  if (state.pending) {
    return <LocalAuthStatus message="Signing in to local development…" />;
  }

  if (state.error !== null) {
    return <LocalAuthStatus message={state.error} />;
  }

  return <LocalAuthContext.Provider value={context}>{children}</LocalAuthContext.Provider>;
}

export function useLocalAuthenticatedEmail(): string | null {
  return useContext(LocalAuthContext).email;
}

function LocalAuthStatus({ message }: { message: string }): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] p-6">
      <Card className="max-w-lg p-6 text-sm text-[var(--muted-foreground)]" role="status">
        {message}
      </Card>
    </main>
  );
}
