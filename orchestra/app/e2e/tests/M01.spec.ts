import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('M01 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'arun@saisai.test');
  await page.goto('/');
  const a0 = await askChat(page, "B-250 มีสีอะไร");
  expect(a0.text).toMatch(/ใส/i);
  expect(a0.text).toMatch(/ชา/i);
  expect(a0.text).toMatch(/เขียว/i);
  const a1 = await askChat(page, "สีเขียวใบละเท่าไร");
  expect(hasAmount(a1.text, "5.80"), a1.text).toBe(true);
  const a2 = await askChat(page, "ขั้นต่ำเท่าไร");
  expect(a2.text).toMatch(/1,?200/i);
  const a3 = await askChat(page, "ถ้าหมื่นใบค่าขวดเท่าไร");
  expect(hasAmount(a3.text, "58000.00"), a3.text).toBe(true);
  expect(hasAmount(a3.text, "2900.00"), a3.text).toBe(true);
  expect(a3.text).toMatch(/5\s*%/i);
  const a4 = await askChat(page, "ใส่โลโก้ด้วยเพิ่มเท่าไร");
  expect(hasAmount(a4.text, "8000.00"), a4.text).toBe(true);
  expect(await page.getByTestId('chat-msg-user').count()).toBe(5);
  expect(await page.getByTestId('chat-msg-bot').count()).toBe(5);

  await hold(page);
});
