import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C14 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'arun@saisai.test');
  await page.goto('/');
  const answer = await askChat(page, "SO-0001 ถึงไหนแล้ว");
  expect(answer.text).toMatch(/ไม่พบออเดอร์นี้/i);
  expect(answer.text).not.toMatch(/ธีระ|C02|ยอด|\d[\d,]*\.\d{2}/);

  await hold(page);
});
