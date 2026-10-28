// E03 (T17) · ?only=fail เห็นเฉพาะ eval-item data-pass=false · คลิกเล่มใน eval-by-doc → ?doc= เฉพาะเล่มนั้น
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { reset, login, hold, waitReady, EVAL_TOKEN, E2E_DIR } from '../lib';

const runA = JSON.parse(fs.readFileSync(path.join(E2E_DIR, 'fixtures/eval-run-a.json'), 'utf8'));
type Item = { id: string; pass: boolean; doc: string | null };
const items = runA.items as Item[];

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test('E03 ?only=fail shows only data-pass=false items · ?doc= filters one document', async ({ page, request }) => {
  const r = await request.post('/api/admin/eval', { data: runA, headers: { 'x-eval-token': EVAL_TOKEN } });
  expect(r.status()).toBe(201);
  const { id } = await r.json();

  await login(page, 'wichai@saisai.test');
  await page.goto(`/admin/eval?run=${id}&compare=none`);
  await waitReady(page);
  await expect(page.getByTestId('eval-item')).toHaveCount(items.length);
  await expect(page.getByTestId('eval-by-doc').locator('tbody tr')).toHaveCount(8);

  // ปุ่ม "เฉพาะข้อผิด" → URL ?only=fail
  await page.getByTestId('eval-only-fail').click();
  await expect(page).toHaveURL(/only=fail/);
  const fails = items.filter((x) => !x.pass);
  expect(fails.length).toBeGreaterThan(0);
  const shown = page.getByTestId('eval-item');
  await expect(shown).toHaveCount(fails.length);
  await expect(page.locator('[data-testid="eval-item"][data-pass="true"]')).toHaveCount(0);
  expect((await shown.evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))).sort()).toEqual(fails.map((x) => x.id).sort());

  // เปิดดูข้อผิดข้อแรก
  await shown.first().locator('summary').click();
  await expect(shown.first().locator('.eval-detail')).toBeVisible();

  // คลิกเล่มในตาราง eval-by-doc → เฉพาะเล่มนั้น (ทุกข้อ) แล้วกรองข้อผิดของเล่มนั้น
  const doc = 'SS-LOGISTICS.pdf';
  await page.getByTestId('eval-by-doc').locator(`a[data-doc="${doc}"]`).click();
  await expect(page).toHaveURL(/doc=SS-LOGISTICS\.pdf/);
  await expect(shown).toHaveCount(items.filter((x) => x.doc === doc).length);
  await page.getByTestId('eval-only-fail').click();
  await expect(page).toHaveURL(/only=fail/);
  const docFails = items.filter((x) => x.doc === doc && !x.pass);
  await expect(shown).toHaveCount(docFails.length);
  for (const el of await shown.all()) {
    await expect(el).toHaveAttribute('data-pass', 'false');
    await expect(el).toHaveAttribute('data-doc', doc);
  }

  // เปิดตรงด้วย URL ?only=fail (ไม่ผ่านปุ่ม)
  await page.goto(`/admin/eval?run=${id}&compare=none&only=fail`);
  await waitReady(page);
  await expect(page.getByTestId('eval-item')).toHaveCount(fails.length);
  await expect(page.locator('[data-testid="eval-item"]:not([data-pass="false"])')).toHaveCount(0);
  await page.getByTestId('eval-item').first().scrollIntoViewIfNeeded();
  await hold(page);
});
