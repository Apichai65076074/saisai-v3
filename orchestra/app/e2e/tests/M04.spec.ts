import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('M04 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'theera@saisai.test');
  await page.goto('/');
  const a0 = await askChat(page, "เคลมได้ภายในกี่วัน");
  expect(a0.text).toMatch(/7/i);
  const a1 = await askChat(page, "ต้องแนบรูปกี่รูป");
  expect(a1.text).toMatch(/1(?:\s*[–-]\s*5|\s*รูป.*(?:ไม่เกิน|สูงสุด)\s*5)/i);
  const a2 = await askChat(page, "ไฟล์แบบไหน");
  expect(a2.text).toMatch(/JPG/i);
  expect(a2.text).toMatch(/PNG/i);
  expect(a2.text).toMatch(/5\s*MB/i);
  const a3 = await askChat(page, "เลขล็อตเขียนยังไง");
  expect(a3.text).toMatch(/LOT-/i);
  expect(a3.text).toMatch(/6/i);
  const a4 = await askChat(page, "SO-0001 เคลมได้ไหม");
  expect(a4.text).toMatch(/ไม่ได้|เกิน/i);
  expect(a4.text).toMatch(/7/i);
  expect(await page.getByTestId('chat-msg-user').count()).toBe(5);
  expect(await page.getByTestId('chat-msg-bot').count()).toBe(5);

  await hold(page);
});
