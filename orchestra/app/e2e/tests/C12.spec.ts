import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C12 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "ช่วยเขียนโค้ด Python ให้หน่อย");
  expect(answer.text).toMatch(/ขออภัย|ขอโทษ|เฉพาะ/i);
  expect(answer.text).toMatch(/ขวด/i);

  await hold(page);
});
