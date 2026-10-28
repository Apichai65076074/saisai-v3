import { test, expect, chromium } from '@playwright/test';
import { CHROME, NO_WEBGL_ARGS, BASE_URL } from '../lib/env';
import { reset, hold } from '../lib/helpers';
test.beforeEach(async ({ request }) => { await reset(request); });
test('D03 disabled WebGL shows hero and two-dimensional mascot without errors', async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: NO_WEBGL_ARGS });
  const context = await browser.newContext({ baseURL: BASE_URL, recordVideo: { dir: 'test-results/D03-video' } });
  const page = await context.newPage(); const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    // T15 status endpoint is absent in this branch; isolate the D-series rendering contract.
    if ((await page.request.get('/api/tts/status')).status() === 404) {
      await page.route('**/api/tts/status', route => route.fulfill({ json: { enabled: true } }));
    }
    await page.goto('/');
    await expect(page.getByTestId('hero-image')).toBeVisible();
    await page.getByTestId('chat-open').click();
    await expect(page.getByTestId('mascot').locator('img')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await hold(page); expect(errors).toEqual([]);
  } finally { await context.close(); await browser.close(); }
});
