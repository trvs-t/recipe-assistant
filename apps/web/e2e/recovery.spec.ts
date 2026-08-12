import { expect, test, type Page, type Route } from '@playwright/test';

const sourceUrl: string = 'https://recipes.example/failing-recipe';
const failedJobId: string = 'job-failed';
const retryJobId: string = 'job-retry';

interface IImportApiState {
  submissionCount: number;
}

function importJobRow(jobId: string, status: 'failed' | 'queued'): Record<string, unknown> {
  const failed: boolean = status === 'failed';
  return {
    id: jobId,
    user_id: 'e2e-user',
    source_url: sourceUrl,
    idempotency_key: `e2e-${jobId}`,
    status,
    attempt_count: failed ? 3 : 0,
    max_attempts: 3,
    queue_message_id: failed ? 41 : 42,
    recipe_id: null,
    next_attempt_at: null,
    error_code: failed ? 'AI_NORMALIZATION_FAILED' : null,
    error_message: failed ? 'The recipe parser returned an unusable response.' : null,
    error_retryable: failed ? false : null,
    created_at: '2026-08-03T10:00:00.000Z',
    updated_at: '2026-08-03T10:01:00.000Z',
  };
}

async function installImportApiMock(page: Page): Promise<IImportApiState> {
  const state: IImportApiState = { submissionCount: 0 };
  await page.route('https://supabase.test/**', async (route: Route): Promise<void> => {
    const requestUrl: URL = new URL(route.request().url());
    const responseHeaders: Record<string, string> = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'content-type': 'application/json',
    };

    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: responseHeaders, body: '{}' });
      return;
    }

    if (requestUrl.pathname === '/auth/v1/token') {
      await route.fulfill({
        status: 200,
        headers: responseHeaders,
        json: {
          access_token: 'e2e-access-token',
          refresh_token: 'e2e-refresh-token',
          expires_in: 3_600,
          token_type: 'bearer',
          user: {
            id: 'e2e-user',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'dev@example.com',
            created_at: '2026-08-03T00:00:00.000Z',
          },
        },
      });
      return;
    }

    if (requestUrl.pathname === '/functions/v1/import-recipe-v2') {
      state.submissionCount += 1;
      const jobId: string = state.submissionCount === 1 ? failedJobId : retryJobId;
      await route.fulfill({
        status: 200,
        headers: responseHeaders,
        json: {
          job_id: jobId,
          job_status: 'queued',
          recipe_id: null,
          deduplicated: false,
        },
      });
      return;
    }

    if (requestUrl.pathname === '/rest/v1/recipe_import_jobs') {
      const requestedJob: string = requestUrl.searchParams.get('id') ?? '';
      const isRetry: boolean = requestedJob.includes(retryJobId);
      await route.fulfill({
        status: 200,
        headers: responseHeaders,
        json: importJobRow(isRetry ? retryJobId : failedJobId, isRetry ? 'queued' : 'failed'),
      });
      return;
    }

    await route.fulfill({ status: 404, headers: responseHeaders, json: { message: 'Unhandled E2E request' } });
  });
  return state;
}

async function submitFailingImport(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Recipe URL' }).fill(sourceUrl);
  await page.getByRole('button', { name: 'Import recipe' }).click();
  await page.getByRole('link', { name: 'View progress' }).click();
  await expect(page).toHaveURL(new RegExp(`/import/${failedJobId}$`));
  await expect(page.getByText('Import failed')).toBeVisible();
}

test('failed import can be retried as a fresh durable job', async ({ page }: { page: Page }): Promise<void> => {
  const apiState: IImportApiState = await installImportApiMock(page);
  await submitFailingImport(page);

  await expect(
    page.getByRole('alert').getByText('The recipe parser returned an unusable response.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry import' }).click();

  await expect(page).toHaveURL(new RegExp(`/import/${retryJobId}$`));
  await expect(page.getByText('Import in progress')).toBeVisible();
  expect(apiState.submissionCount).toBe(2);
});

test('failed import can return to a prefilled URL for correction', async ({ page }: { page: Page }): Promise<void> => {
  await installImportApiMock(page);
  await submitFailingImport(page);

  await page.getByRole('button', { name: 'Edit source URL' }).click();

  await expect(page).toHaveURL(/\/\?sourceUrl=/);
  await expect(page.getByRole('textbox', { name: 'Recipe URL' })).toHaveValue(sourceUrl);
});
