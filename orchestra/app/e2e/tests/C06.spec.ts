import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C06 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "พิมพ์โลโก้ใบละเท่าไร ขั้นต่ำเท่าไร");
  expect(hasAmount(answer.text, "0.80"), answer.text).toBe(true);
  expect(answer.text).toMatch(/5,?000/i);

  await hold(page);
});
