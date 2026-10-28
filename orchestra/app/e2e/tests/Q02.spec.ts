import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('Q02 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await openChat(page);
  await stopService('chat-worker');
  try {
    await typeSlow(page.getByTestId('chat-input'), 'B-500 ขั้นต่ำกี่ใบ');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-status')).toContainText('รอคิว');
    await hold(page, 3500);
  } finally { await startService('chat-worker'); }
  await expect(page.getByTestId('chat-msg-bot').last()).toHaveAttribute('data-done', 'true', { timeout: 100_000 });
  await expect(page.getByTestId('chat-msg-bot').last()).toContainText('800');
  await expect(page.getByTestId('chat-msg-user')).toHaveCount(1);

  await hold(page);
});
