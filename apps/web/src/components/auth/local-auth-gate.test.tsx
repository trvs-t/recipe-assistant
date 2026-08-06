import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SignInPanel } from './local-auth-gate';

afterEach((): void => {
  cleanup();
});

describe('SignInPanel', (): void => {
  it('validates credentials before calling the password sign-in action', async (): Promise<void> => {
    const onSignInWithPassword = vi.fn<(...args: [string, string]) => Promise<void>>(
      async (): Promise<void> => undefined,
    );

    render(
      <SignInPanel
        error={null}
        onSignInWithPassword={onSignInWithPassword}
        onSignInWithSocial={async (): Promise<void> => undefined}
        pending={false}
      />,
    );

    const form: HTMLFormElement | null = screen.getByRole('button', { name: 'Sign in' }).closest('form');
    if (form === null) {
      throw new Error('The sign-in form is missing');
    }
    fireEvent.submit(form);

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email and password');
    expect(onSignInWithPassword).not.toHaveBeenCalled();
  });

  it('submits trimmed password credentials and exposes both social providers', async (): Promise<void> => {
    const user = userEvent.setup();
    const onSignInWithPassword = vi.fn<(...args: [string, string]) => Promise<void>>(
      async (): Promise<void> => undefined,
    );
    const onSignInWithSocial = vi.fn<(...args: ['google' | 'github']) => Promise<void>>(
      async (): Promise<void> => undefined,
    );

    render(
      <SignInPanel
        error={null}
        onSignInWithPassword={onSignInWithPassword}
        onSignInWithSocial={onSignInWithSocial}
        pending={false}
      />,
    );

    await user.type(screen.getByLabelText('Email'), ' cook@example.com ');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.click(screen.getByRole('button', { name: 'Google' }));
    await user.click(screen.getByRole('button', { name: 'GitHub' }));

    expect(onSignInWithPassword).toHaveBeenCalledWith('cook@example.com', 'secret');
    expect(onSignInWithSocial).toHaveBeenNthCalledWith(1, 'google');
    expect(onSignInWithSocial).toHaveBeenNthCalledWith(2, 'github');
  });
});
