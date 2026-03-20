import { expect, test } from '@playwright/test';

test('smoke: render local HTML', async ({ page }) => {
  await page.setContent('<h1>Hello, Playwright</h1>');
  await expect(page.getByRole('heading', { name: 'Hello, Playwright' })).toBeVisible();
});

