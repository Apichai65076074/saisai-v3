import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C02 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "มีขวดกี่แบบ");
  expect(answer.text).toMatch(/9/i);
  expect(answer.text).toMatch(/100/i);
  expect(answer.text).toMatch(/150/i);
  expect(answer.text).toMatch(/250/i);
  expect(answer.text).toMatch(/500/i);

  await hold(page);
});
