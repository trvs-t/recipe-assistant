import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GoogleLoginForm } from './google-login-form';

afterEach((): void => {
  cleanup();
});

describe('GoogleLoginForm', (): void => {
  it('exposes Google as the only sign-in method', async (): Promise<void> => {
    const user = userEvent.setup();
    const onSignIn = vi.fn<() => Promise<void>>(async (): Promise<void> => undefined);

    render(
      <GoogleLoginForm
        error={null}
        onSignIn={onSignIn}
        pending={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

    expect(onSignIn).toHaveBeenCalledOnce();
    expect(screen.queryByText(/GitHub/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });
});
