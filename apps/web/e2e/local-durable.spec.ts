import { expect, test, type Page, type TestInfo } from '@playwright/test';

test.setTimeout(120_000);

const requestedRecipeUrl: string =
  process.env.LOCAL_E2E_RECIPE_URL ??
  'https://www.recipesfromitaly.com/tiramisu-original-italian-recipe/';

test('local authenticated import survives refresh and is added to the library', async ({
  page,
}: {
  page: Page;
}, testInfo: TestInfo): Promise<void> => {
  await page.goto('/');
  await expect(page.getByText('Connected as dev@example.com')).toBeVisible();

  await page.goto('/');
  await page.getByLabel('Recipe URL').fill(requestedRecipeUrl);
  await page.getByRole('button', { name: 'Import recipe' }).click();

  await expect(page.getByRole('heading', { name: new RegExp('Importing from') })).toBeVisible();
  await page.getByRole('link', { name: 'View progress' }).click();
  await expect(page).toHaveURL(/\/import\/[0-9a-f-]{36}$/);
  await page.reload();
  await expect(page.getByText('That import has expired.')).not.toBeVisible();
  await expect(page.getByText('Import complete')).toBeVisible({ timeout: 90_000 });

  await page.getByRole('button', { name: 'Open recipe' }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
  const sourceHost: string = new URL(requestedRecipeUrl).hostname.replace(/^www\./, '');
  await expect(page.getByRole('link', { name: sourceHost })).toBeVisible();
  const recipeHeading: string | null = await page.getByRole('heading', { level: 1 }).textContent();
  expect(recipeHeading).not.toBeNull();
  await expect(page.getByRole('link', { name: sourceHost })).toHaveAttribute(
    'href',
    requestedRecipeUrl,
  );

  await page.getByRole('link', { name: 'Back to library' }).click();
  await expect(page.getByRole('link', { name: recipeHeading ?? '' }).first()).toBeVisible();
  await testInfo.attach('persisted-library', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
