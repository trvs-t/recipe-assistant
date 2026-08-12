import { expect, test, type Page } from '@playwright/test';

test('recipe detail keeps source traceability, synchronizes amounts, edits inline, and adds variants', async ({
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

  const servingsInput = page.getByRole('spinbutton', { name: 'Servings' });
  const salmonAmount = page.getByRole('spinbutton', { name: 'Amount for salmon' });
  const misoAmount = page.getByRole('spinbutton', { name: 'Amount for white miso' });
  await expect(servingsInput).toHaveCSS('appearance', 'textfield');
  await expect(salmonAmount).toHaveCSS('appearance', 'textfield');
  await expect(servingsInput).toHaveValue('2');
  const servingsBoxBefore = await servingsInput.boundingBox();
  if (servingsBoxBefore === null) throw new Error('Servings input should be visible before scaling.');
  await page.getByRole('button', { name: 'Increase servings' }).click();
  await expect(servingsInput).toHaveValue('3');
  await expect(salmonAmount).toHaveValue('3');
  await expect(misoAmount).toHaveValue('2.25');
  const resetServingsButton = page.getByRole('button', { name: 'Reset servings to 2' });
  await expect(resetServingsButton).toBeVisible();
  const servingsBoxAfter = await servingsInput.boundingBox();
  if (servingsBoxAfter === null) throw new Error('Servings input should be visible after scaling.');
  expect(servingsBoxAfter.x + (servingsBoxAfter.width / 2)).toBeCloseTo(
    servingsBoxBefore.x + (servingsBoxBefore.width / 2),
    1,
  );
  const resetServingsBox = await resetServingsButton.boundingBox();
  const decreaseServingsBox = await page.getByRole('button', { name: 'Decrease servings' }).boundingBox();
  if (resetServingsBox === null || decreaseServingsBox === null) {
    throw new Error('Reset and decrease serving controls should be visible after scaling.');
  }
  expect(decreaseServingsBox.x - (resetServingsBox.x + resetServingsBox.width)).toBeLessThanOrEqual(8);

  await misoAmount.fill('3');
  await expect(servingsInput).toHaveValue('4');
  await expect(salmonAmount).toHaveValue('4');

  const salmonName = page.getByRole('textbox', { name: 'Name for salmon' });
  await salmonName.fill('trout');
  await salmonName.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Name for trout' })).toHaveValue('trout');
  const savedTag = page.getByRole('status', { name: 'trout saved' });
  await expect(savedTag).toBeVisible();
  await expect(savedTag).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(savedTag).toHaveCSS('animation-name', 'saved-indicator-fade-in');
  await expect(page.getByText('Saved. Further changes save automatically.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Add variant for trout' }).click();
  await expect(page.getByLabel('1 variant for trout')).toHaveText('1');
  const variantName = page.getByRole('textbox', { name: 'Name for trout alternative' });
  await expect(variantName).toBeFocused();
  await variantName.fill('firm tofu');
  await variantName.press('Enter');
  await page.getByRole('button', { name: 'Edit variants for trout' }).click();
  await expect(page.getByRole('menuitemradio', { name: 'trout' })).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: 'firm tofu' })).toBeVisible();
  await page.keyboard.press('Escape');

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
  await page.reload();
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
