import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C09 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "เมื่อไรจะได้เครดิต");
  expect(answer.text).toMatch(/3/i);
  expect(answer.text).toMatch(/30/i);

  await hold(page);
});
