import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('M03 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'arun@saisai.test');
  await page.goto('/');
  const a0 = await askChat(page, "B-500 ใส 25,000 ใบ ส่งนครสวรรค์ 160 กม. ค่าส่งเท่าไร");
  expect(a0.text).toMatch(/2\s*เที่ยว/i);
  expect(hasAmount(a0.text, "3000.00"), a0.text).toBe(true);
  const a1 = await askChat(page, "ถ้าส่งลาดกระบังแทน");
  expect(a1.text).toMatch(/ค่าส่ง\s*(?:฿\s*)?0(?:\.00)?|ส่งฟรี/i);
  const a2 = await askChat(page, "ฉะเชิงเทราล่ะ");
  expect(hasAmount(a2.text, "3000.00"), a2.text).toBe(true);
  const a3 = await askChat(page, "ถ้าไกลเกิน 300 กม.");
  expect(a3.text).toMatch(/DISTANCE_TOO_FAR|เซลส์|sales/i);
  const a4 = await askChat(page, "เบอร์อะไร");
  expect(a4.text).toMatch(/02-000-0000/i);
  expect(await page.getByTestId('chat-msg-user').count()).toBe(5);
  expect(await page.getByTestId('chat-msg-bot').count()).toBe(5);

  await hold(page);
});
