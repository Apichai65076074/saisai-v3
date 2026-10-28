import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C10 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "ขอขวดตัวอย่างได้กี่ใบ");
  expect(answer.text).toMatch(/3/i);
  expect(answer.text).toMatch(/รุ่น/i);
  expect(answer.text).toMatch(/เดือน/i);
  expect(answer.text).toMatch(/ฟรี/i);

  await hold(page);
});
