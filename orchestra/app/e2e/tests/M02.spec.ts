import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('M02 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'arun@saisai.test');
  await page.goto('/');
  const a0 = await askChat(page, "ราคา B-100 ใส 9,600 ใบ ส่งคลังบางนา");
  expect(hasAmount(a0.text, "30720.00"), a0.text).toBe(true);
  expect(hasAmount(a0.text, "2150.40"), a0.text).toBe(true);
  expect(hasAmount(a0.text, "32870.40"), a0.text).toBe(true);
  expect(a0.text).toMatch(/10,?000/i);
  expect(hasAmount(a0.text, "320.00"), a0.text).toBe(true);
  const a1 = await askChat(page, "แล้วถ้าหมื่นใบล่ะ");
  expect(hasAmount(a1.text, "30400.00"), a1.text).toBe(true);
  expect(hasAmount(a1.text, "32528.00"), a1.text).toBe(true);
  const a2 = await askChat(page, "รับของเร็วสุดวันไหน");
  expect(a2.text).toMatch(/2026-10-25/i);
  const a3 = await askChat(page, "ขอใบเสนอราคาเลย");
  expect(a3.text).toMatch(/QT-\d+/i);
  const a4 = await askChat(page, "ใบนี้หมดอายุเมื่อไร");
  expect(a4.text).toMatch(/2026-10-18/i);
  expect(await page.getByTestId('chat-msg-user').count()).toBe(5);
  expect(await page.getByTestId('chat-msg-bot').count()).toBe(5);

  await hold(page);
});
