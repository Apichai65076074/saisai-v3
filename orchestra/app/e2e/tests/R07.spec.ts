import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('R07 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'wichai@saisai.test', { goto: '/admin/docs' });
  await page.getByTestId('doc-upload-input').setInputFiles(new URL('../fixtures/SS-PROMO-NOV.pdf', import.meta.url).pathname);
  await page.getByTestId('doc-upload-submit').click();
  await expect(page.locator('[data-testid="doc-row"][data-filename="SS-PROMO-NOV.pdf"]')).toHaveAttribute('data-status', 'ready', { timeout: 150_000 });
  await page.goto('/');
  const answer = await askChat(page, "เดือนพฤศจิกายนมีโปรอะไร");
  expect(answer.text).toMatch(/ออกแบบโลโก้ฟรี/i);
  expect(answer.cites.some(c => /SS-PROMO-NOV\.pdf/.test(c.filename)), JSON.stringify(answer)).toBe(true);
  for (const cite of answer.cites) {
    expect(cite.page).toBeGreaterThan(0);
    const link = page.getByTestId('chat-msg-bot').nth(answer.index).locator(`[data-testid=chat-cite][data-filename='${cite.filename}'][data-page='${cite.page}']`);
    await expect(link).toHaveAttribute('href', `/api/docs/${cite.filename}#page=${cite.page}`);
    await expect(link).toHaveAttribute('target', '_blank');
  }

  await hold(page);
});
