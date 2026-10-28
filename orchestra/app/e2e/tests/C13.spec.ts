import { test, expect } from '@playwright/test';
import { reset, login, hold, askChat, hasAmount, openChat, stopService, startService, typeSlow } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('C13 chat acceptance', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'arun@saisai.test');
  await page.goto('/');
  const answer = await askChat(page, "ขอใบเสนอราคา B-250 ใส 10,000 ใบ พิมพ์โลโก้ ส่งโรงงานนครสวรรค์");
  expect(answer.text).toMatch(/QT-\d+/i);
  expect(hasAmount(answer.text, "63023.00"), answer.text).toBe(true);
  const r = await page.request.get('/api/quotes');
  expect(JSON.stringify(await r.json())).toContain('QT-0001');

  await hold(page);
});
