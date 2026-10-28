import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C03 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "ขวด 250 มล. สีเขียวใบละเท่าไร");
  expect(hasAmount(answer.text, "5.80"), answer.text).toBe(true);

  await hold(page);
});
