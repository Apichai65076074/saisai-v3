import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C11 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "มีขวด 1 ลิตรไหม");
  expect(answer.text).toMatch(/ไม่มี|ไม่มีสินค้า/i);

  await hold(page);
});
