import { expect, test, type Page } from '@playwright/test';

test('recipe detail keeps source traceability, scales portions, and renders the DAG', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your recipes' })).toBeVisible();

  await page.getByRole('link', { name: 'Miso butter salmon' }).click();
  await expect(page).toHaveURL(/\/recipes\/demo-miso-salmon$/);
  await expect(page.getByRole('heading', { name: 'Miso butter salmon' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'justonecookbook.com' })).toHaveAttribute(
    'href',
    'https://www.justonecookbook.com/miso-salmon/',
  );

  const servingsInput = page.getByRole('spinbutton', { name: 'Desired servings' });
  await expect(servingsInput).toHaveValue('2');
  await page.getByRole('button', { name: 'Increase servings' }).click();
  await expect(servingsInput).toHaveValue('3');
  await expect(page.getByText('3 fillets, skin on')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Recipe as a flow' })).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await expect(page.locator('summary').filter({ hasText: 'Step-by-step recipe summary' })).toBeVisible();
});

test('demo import appears in the library immediately and retains a durable progress link', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Recipe URLs' }).fill(
    'https://www.justonecookbook.com/miso-salmon/',
  );

  await page.getByRole('button', { name: 'Import recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Importing from justonecookbook.com' })).toBeVisible();
  await page.getByRole('link', { name: 'View progress' }).click();
  await expect(page).toHaveURL(/\/import\/demo-import-\d+-\d+$/);
  await expect(page.getByText('Import in progress')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'https://www.justonecookbook.com/miso-salmon/' }),
  ).toHaveAttribute('href', 'https://www.justonecookbook.com/miso-salmon/');
});

test('bulk import queues each unique pasted URL and links to every status page', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Recipe URLs' }).fill(
    [
      'Recipes to try:',
      '- https://example.com/recipe-one',
      '2. https://example.com/recipe-two',
      '• https://example.com/recipe-one',
    ].join('\n'),
  );

  page.once('dialog', async (dialog): Promise<void> => {
    expect(dialog.message()).toBe('Found 2 recipe URLs. Other pasted text will be ignored. Continue?');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Import 2 recipes' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Importing from example.com' })).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'View progress' })).toHaveCount(2);
});

test('mobile library stays within the viewport and exposes navigation', async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Your recipes' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Recipe URLs' })).toBeVisible();
  const overflowsViewport: boolean = await page.evaluate(
    (): boolean => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflowsViewport).toBe(false);
});
