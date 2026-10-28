import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('R02 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const answer = await askChat(page, "รถหนึ่งเที่ยวขนขวดได้กี่ใบ");
  expect(answer.text).toMatch(/20,?000/i);
  expect(answer.cites.some(c => /SS-LOGISTICS\.pdf/.test(c.filename)), JSON.stringify(answer)).toBe(true);
  for (const cite of answer.cites) {
    expect(cite.page).toBeGreaterThan(0);
    const link = page.getByTestId('chat-msg-bot').nth(answer.index).locator(`[data-testid=chat-cite][data-filename='${cite.filename}'][data-page='${cite.page}']`);
    await expect(link).toHaveAttribute('href', `/api/docs/${cite.filename}#page=${cite.page}`);
    await expect(link).toHaveAttribute('target', '_blank');
  }

  await hold(page);
});
