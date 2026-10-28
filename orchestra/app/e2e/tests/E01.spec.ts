// E01 (T17) · POST eval-run-a.json → การ์ด eval-metric ตรงไฟล์ทุกตัว · POST ไม่มีสิทธิ์ → 401 / ลูกค้า → 403
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { reset, login, hold, waitReady, EVAL_TOKEN, E2E_DIR } from '../lib';

const runA = JSON.parse(fs.readFileSync(path.join(E2E_DIR, 'fixtures/eval-run-a.json'), 'utf8'));

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test('E01 POST eval-run-a.json → eval-metric cards match the file · unauthorized POST → 401', async ({ page, request }) => {
  // ไม่มี token/cookie → 401 · token ผิด → 401 · ลูกค้า → 403
  const anon = await request.post('/api/admin/eval', { data: runA });
  expect(anon.status()).toBe(401);
  expect((await anon.json()).errors[0].code).toBe('UNAUTHORIZED');
  expect((await request.post('/api/admin/eval', { data: runA, headers: { 'x-eval-token': 'wrong' } })).status()).toBe(401);
  expect((await request.get('/api/admin/eval')).status()).toBe(401);
  await login(page, 'arun@saisai.test');
  expect((await page.request.post('/api/admin/eval', { data: runA })).status()).toBe(403);
  await page.request.post('/api/auth/logout');

  // รูปแบบผิด → 400 EVAL_INVALID
  const bad = await request.post('/api/admin/eval', { data: { ...runA, config: { mode: 'mock' } }, headers: { 'x-eval-token': EVAL_TOKEN } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).errors[0]).toMatchObject({ code: 'EVAL_INVALID', field: 'config.rerank' });

  const r = await request.post('/api/admin/eval', { data: runA, headers: { 'x-eval-token': EVAL_TOKEN } });
  expect(r.status()).toBe(201);
  const { id } = await r.json();
  expect(id).toBeGreaterThan(0);

  await login(page, 'wichai@saisai.test');
  await page.goto(`/admin/eval?run=${id}&compare=none`);
  await waitReady(page);
  await expect(page.getByTestId('eval-run-select')).toHaveValue(String(id));

  // การ์ดครบทุก metric ใน summary ของไฟล์ (ไม่รวม n) และ data-value ตรงไฟล์
  let expected = 0;
  for (const set of ['rag', 'qa', 'conv']) {
    for (const [metric, value] of Object.entries(runA.summary[set] as Record<string, number>)) {
      if (metric === 'n') continue;
      expected++;
      const card = page.locator(`[data-testid="eval-metric"][data-set="${set}"][data-metric="${metric}"]`);
      await expect(card).toHaveCount(1);
      expect(Number(await card.getAttribute('data-value'))).toBeCloseTo(value, 6);
      await expect(card).toContainText(`${(value * 100).toFixed(1)}%`);
    }
  }
  await expect(page.getByTestId('eval-metric')).toHaveCount(expected);

  // ตัวเลขใหญ่: run A = rerank on → X% = summary.rag.correctness
  await expect(page.getByTestId('eval-headline')).toHaveAttribute('data-on', String(runA.summary.rag.correctness));
  await expect(page.getByTestId('eval-headline')).toContainText(`${(runA.summary.rag.correctness * 100).toFixed(1)}%`);

  // GET ?id= คืน run ครบ
  const got = await page.request.get(`/api/admin/eval?id=${id}`);
  const j = await got.json();
  expect(j.run.items).toHaveLength(runA.items.length);
  expect(j.run.by_doc).toHaveLength(7);
  await page.getByTestId('eval-metric').first().scrollIntoViewIfNeeded();
  await hold(page);
});
