import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ImportRecoveryPanel } from './import-recovery-panel';

afterEach((): void => {
  cleanup();
});

describe('ImportRecoveryPanel', (): void => {
  it('shows automatic retry timing and checks the job now for retry_wait', async (): Promise<void> => {
    const user = userEvent.setup();
    const onCheckNow: () => void = vi.fn<() => void>();

    render(
      <ImportRecoveryPanel
        message="A temporary network issue occurred."
        nextAttemptAt="2026-08-03T09:30:00.000Z"
        onCheckNow={onCheckNow}
        state="retry_wait"
      />,
    );

    expect(screen.getByText(/Next automatic attempt:/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check now' }));

    expect(onCheckNow).toHaveBeenCalledTimes(1);
  });

  it('explains a needs_input result and offers edit plus retry actions', async (): Promise<void> => {
    const user = userEvent.setup();
    const onEditSource: () => void = vi.fn<() => void>();
    const onRetryImport: () => void = vi.fn<() => void>();

    render(
      <ImportRecoveryPanel
        errorCode="MISSING_RECIPE_OUTPUT"
        message="The page did not contain a complete recipe output."
        onEditSource={onEditSource}
        onRetryImport={onRetryImport}
        state="needs_input"
      />,
    );

    expect(screen.getByText(/usable recipe output/)).toBeInTheDocument();
    expect(screen.getByText('The page did not contain a complete recipe output.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit source URL' }));
    await user.click(screen.getByRole('button', { name: 'Retry import' }));

    expect(onEditSource).toHaveBeenCalledTimes(1);
    expect(onRetryImport).toHaveBeenCalledTimes(1);
  });

  it('offers a fresh retry and source editing for a failed import', async (): Promise<void> => {
    const user = userEvent.setup();
    const onEditSource: () => void = vi.fn<() => void>();
    const onRetryImport: () => void = vi.fn<() => void>();

    render(
      <ImportRecoveryPanel
        errorCode="SOURCE_UNAVAILABLE"
        message="The source could not be reached."
        onEditSource={onEditSource}
        onRetryImport={onRetryImport}
        state="failed"
      />,
    );

    expect(screen.getByText('The source could not be reached.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry import' }));
    await user.click(screen.getByRole('button', { name: 'Edit source URL' }));

    expect(onRetryImport).toHaveBeenCalledTimes(1);
    expect(onEditSource).toHaveBeenCalledTimes(1);
  });

  it('offers Try again when the import status cannot be loaded', async (): Promise<void> => {
    const user = userEvent.setup();
    const onTryAgain: () => void = vi.fn<() => void>();

    render(
      <ImportRecoveryPanel
        message="The request timed out."
        onTryAgain={onTryAgain}
        state="query_error"
      />,
    );

    expect(screen.getByText('The request timed out.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it('offers Check again when completion has no recipe id', async (): Promise<void> => {
    const user = userEvent.setup();
    const onCheckAgain: () => void = vi.fn<() => void>();

    render(
      <ImportRecoveryPanel
        message="The job completed without a linked recipe."
        onCheckAgain={onCheckAgain}
        state="completed_without_recipe"
      />,
    );

    expect(screen.getByText(/recipe is not linked yet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check again' }));

    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });
});
