import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('M06 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'kenji@saisai.test');
  await page.goto('/');
  const a0 = await askChat(page, "What sizes?");
  expect(a0.text).toMatch(/100/i);
  expect(a0.text).toMatch(/150/i);
  expect(a0.text).toMatch(/250/i);
  expect(a0.text).toMatch(/500/i);
  const a1 = await askChat(page, "Price of B-150 amber?");
  expect(hasAmount(a1.text, "4.10"), a1.text).toBe(true);
  const a2 = await askChat(page, "Minimum?");
  expect(a2.text).toMatch(/1,?800/i);
  const a3 = await askChat(page, "Free samples?");
  expect(a3.text).toMatch(/3/i);
  expect(a3.text).toMatch(/per model/i);
  expect(a3.text).toMatch(/month/i);
  const a4 = await askChat(page, "Earliest pickup?");
  expect(a4.text).toMatch(/2026-10-25/i);
  expect(await page.getByTestId('chat-msg-user').count()).toBe(5);
  expect(await page.getByTestId('chat-msg-bot').count()).toBe(5);

  await hold(page);
});
