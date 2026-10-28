import { test, expect } from '@playwright/test';
import { reset, hold, login } from '../lib/helpers';
test.beforeEach(async ({ request }) => { await reset(request); });
test('D01 nine glass bottles, conveyor camera and green bottle order', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // T15 status endpoint is absent in this branch; isolate the D-series rendering contract.
  if ((await page.request.get('/api/tts/status')).status() === 404) {
    await page.route('**/api/tts/status', route => route.fulfill({ json: { enabled: true } }));
  }
  // /order is customer-only; log in first so the bottle click lands on the order form.
  await login(page, 'arun@saisai.test', { goto: '/' });
  await expect(page.getByTestId('hero-3d').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('bottle-3d')).toHaveCount(9);
  await page.mouse.wheel(0, 250);
  await hold(page);
  await page.getByTestId('bottle-3d').filter({ hasText: 'green' }).click();
  await expect(page).toHaveURL(/\/order\?model=B-250&color=green/);
  await page.goto('/products');
  const slot = page.locator('[data-slot="bottle-spin"]').first();
  await slot.getByRole('button').click();
  await expect(slot.locator('canvas')).toBeVisible();
  await hold(page);
  expect(errors).toEqual([]);
});
