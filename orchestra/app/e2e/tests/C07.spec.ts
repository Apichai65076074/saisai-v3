import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C07 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "25,000 ใบ ส่งไกล 160 กม. ค่าส่งเท่าไร");
  expect(answer.text).toMatch(/2\s*เที่ยว/i);
  expect(hasAmount(answer.text, "3000.00"), answer.text).toBe(true);

  await hold(page);
});
