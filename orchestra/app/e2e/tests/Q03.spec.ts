import path from 'node:path';
import { test, expect } from '@playwright/test';
import { E2E_DIR, reset, login, hold, stopService, startService } from '../lib';

test.beforeEach(async ({ request }) => { await reset(request); });

test('Q03 อัปโหลด PDF แล้วหยุด rag-worker กลางงาน เปิดกลับเอกสาร ready ไม่หาย', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, 'wichai@saisai.test', { goto: '/admin/docs' });
  await page.getByTestId('doc-upload-input').setInputFiles(path.join(E2E_DIR, 'fixtures/SS-PROMO-NOV.pdf'));
  await page.getByTestId('doc-upload-submit').click();
  const row = page.getByTestId('doc-row').filter({ has: page.locator('a', { hasText: 'SS-PROMO-NOV.pdf' }) });
  // The dev worker uses RAG_HOLD_MS=15000 so the interruption happens before commit.
  await expect(row).toHaveAttribute('data-status', 'processing', { timeout: 60_000 });
  try {
    await stopService('rag-worker');
    await page.reload();
    await expect(row).toHaveAttribute('data-status', 'processing');
    await hold(page, 3500);
  } finally {
    await startService('rag-worker');
  }
  await expect(row).toHaveAttribute('data-status', 'ready', { timeout: 150_000 });
  await expect(row.locator('td').nth(1)).toHaveText('1');
  expect(Number(await row.locator('td').nth(2).textContent())).toBeGreaterThan(0);
  await expect(row).toHaveCount(1);
  const pdf = await page.request.get('/api/docs/SS-PROMO-NOV.pdf');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await hold(page);
});
