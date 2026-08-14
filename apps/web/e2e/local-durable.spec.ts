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
  await page.reload();
  await expect(page.getByRole('heading', { name: new RegExp('Importing from') })).toBeVisible();
  await expect(page.getByRole('heading', { name: new RegExp('Importing from') })).not.toBeVisible({ timeout: 90_000 });
  const sourceHost: string = new URL(requestedRecipeUrl).hostname.replace(/^www\./, '');
  await page
    .getByText(`Source: ${sourceHost}`, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
    .getByRole('link')
    .click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
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

test('authenticated ingredient editing can add and select a variation', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await page.goto('/');
  await expect(page.getByText('Connected as dev@example.com')).toBeVisible();

  await page.getByRole('link', { name: 'Miso Salmon', exact: true }).click();
  const addVariantButton = page.locator('button[aria-label^="Add variant for"]').first();
  const sourceLabel: string | null = await addVariantButton.getAttribute('aria-label');
  expect(sourceLabel).not.toBeNull();
  const sourceName: string = sourceLabel?.replace('Add variant for ', '') ?? '';
  const editedSourceName: string = `${sourceName} edited`;

  const sourceNameInput = page.getByRole('textbox', { name: `Name for ${sourceName}` });
  await sourceNameInput.fill(editedSourceName);
  await sourceNameInput.press('Enter');
  await expect(page.getByRole('textbox', { name: `Name for ${editedSourceName}` })).toHaveValue(editedSourceName);
  await expect(page.getByRole('status', { name: `${editedSourceName} saved` })).toBeVisible();

  await page.getByRole('button', { name: `Add variant for ${editedSourceName}` }).click();

  await expect(page.getByText('Unable to add this ingredient variation.')).not.toBeVisible();
  await expect(page.getByLabel(`1 variant for ${editedSourceName}`)).toHaveText('1');
  await expect(page.getByRole('button', { name: `Edit variants for ${editedSourceName}` })).toBeVisible();
  await expect(page.getByRole('textbox', { name: `Name for ${editedSourceName} alternative` })).toBeFocused();
});
