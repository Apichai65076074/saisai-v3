import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C01 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "ติดต่อเซลส์ได้ทางไหน");
  expect(answer.text).toMatch(/02-000-0000/i);
  expect(answer.text).toMatch(/@saisai-test/i);

  await hold(page);
});
