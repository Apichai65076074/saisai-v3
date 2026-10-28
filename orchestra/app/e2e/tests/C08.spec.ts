import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C08 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "วันรับของเร็วสุดวันไหน");
  expect(answer.text).toMatch(/2026-10-25|25.*ต.ค.*2026/i);

  await hold(page);
});
