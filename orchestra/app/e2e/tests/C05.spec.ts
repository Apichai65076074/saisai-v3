import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C05 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "สั่ง B-250 ใส 10,000 ใบ ได้ส่วนลดกี่ %");
  expect(answer.text).toMatch(/5\s*%/i);

  await hold(page);
});
