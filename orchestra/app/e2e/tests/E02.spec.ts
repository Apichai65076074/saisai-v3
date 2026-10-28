// E02 (T17) · eval-compare 2 run (A rerank on − B rerank off) · +/− สีเขียว/แดงถูกต้อง · eval-by-doc 7 เล่ม + รวม
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Locator } from '@playwright/test';
import { reset, login, hold, waitReady, EVAL_TOKEN, E2E_DIR } from '../lib';

const load = (n: string) => JSON.parse(fs.readFileSync(path.join(E2E_DIR, `fixtures/${n}`), 'utf8'));
const runA = load('eval-run-a.json');
const runB = load('eval-run-b.json');
const GREEN = 'rgb(24, 121, 78)'; // --ok
const RED = 'rgb(180, 35, 24)'; // --danger
const LOWER = new Set(['stt_cer']);

test.beforeEach(async ({ request }) => {
  await reset(request);
});

async function expectTone(cell: Locator, diff: number, lowerIsBetter: boolean) {
  const d = Math.round(diff * 10000) / 10000;
  const tone = d === 0 ? 'same' : (lowerIsBetter ? d < 0 : d > 0) ? 'good' : 'bad';
  await expect(cell).toHaveAttribute('data-tone', tone);
  if (d !== 0) {
    await expect(cell).toContainText(`${d > 0 ? '+' : '−'}${Math.abs(d * 100).toFixed(1)}`);
    await expect(cell).toHaveCSS('color', tone === 'good' ? GREEN : RED);
  }
  return tone;
}

test('E02 eval-compare of 2 runs shows +/− in the right green/red · eval-by-doc has 7 docs + total', async ({ page, request }) => {
  const post = async (run: unknown) => {
    const r = await request.post('/api/admin/eval', { data: run, headers: { 'x-eval-token': EVAL_TOKEN } });
    expect(r.status()).toBe(201);
    return (await r.json()).id as number;
  };
  const idB = await post(runB);
  const idA = await post(runA);

  await login(page, 'wichai@saisai.test');
  await page.goto(`/admin/eval?run=${idB}`);
  await waitReady(page);
  // เลือก run A ผ่าน eval-run-select แล้วเลือกเทียบกับ B
  await page.getByTestId('eval-run-select').selectOption(String(idA));
  await expect(page).toHaveURL(new RegExp(`run=${idA}`));
  await page.getByTestId('eval-compare-select').selectOption(String(idB));
  await expect(page).toHaveURL(new RegExp(`compare=${idB}`));

  const cmp = page.getByTestId('eval-compare');
  await expect(cmp).toHaveAttribute('data-a', String(idA));
  await expect(cmp).toHaveAttribute('data-b', String(idB));
  const seen = new Set<string>();
  for (const set of ['rag', 'qa', 'conv']) {
    for (const [metric, a] of Object.entries(runA.summary[set] as Record<string, number>)) {
      if (metric === 'n') continue;
      const cell = cmp.locator(`tr[data-set="${set}"][data-metric="${metric}"] td.eval-diff`);
      seen.add(await expectTone(cell, a - runB.summary[set][metric], LOWER.has(metric)));
    }
  }
  // fixture มีทั้งดีขึ้น (rag) แย่ลง (stt_cer สูงขึ้น) และเท่ากัน (privacy_ok)
  expect([...seen].sort()).toEqual(['bad', 'good', 'same']);
  await expect(cmp.locator('tr[data-metric="stt_cer"] td.eval-diff')).toHaveAttribute('data-tone', 'bad');

  // eval-by-doc: 7 เล่ม + รวม · on = A · off = B · ผลต่าง on − off
  const byDoc = page.getByTestId('eval-by-doc');
  await expect(byDoc.locator('tbody tr')).toHaveCount(8);
  await expect(byDoc).toHaveAttribute('data-on-run', String(idA));
  await expect(byDoc).toHaveAttribute('data-off-run', String(idB));
  for (const d of runA.by_doc as { doc: string; n: number; correctness: number }[]) {
    const off = (runB.by_doc as typeof runA.by_doc).find((x: { doc: string }) => x.doc === d.doc).correctness;
    const row = byDoc.locator(`tr[data-doc="${d.doc}"]`);
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').nth(0)).toHaveText(String(d.n));
    await expect(row.locator('td').nth(1)).toHaveText(`${(d.correctness * 100).toFixed(1)}%`);
    await expect(row.locator('td').nth(2)).toHaveText(`${(off * 100).toFixed(1)}%`);
    await expectTone(row.locator('td.eval-diff'), d.correctness - off, false);
  }
  const total = byDoc.locator('tr[data-doc="total"]');
  await expectTone(total.locator('td.eval-diff'), runA.summary.rag.correctness - runB.summary.rag.correctness, false);
  await expect(byDoc.locator('tr[data-doc="SS-POLICY.pdf"] td.eval-diff')).toHaveCSS('color', RED);
  await expect(page.getByTestId('eval-headline')).toContainText(`${(runA.summary.rag.correctness * 100).toFixed(1)}%`);
  await expect(page.getByTestId('eval-headline')).toContainText(`${(runB.summary.rag.correctness * 100).toFixed(1)}%`);
  await expect(page.getByTestId('eval-by-doc-chart')).toHaveAttribute('data-rows', '7');
  await cmp.scrollIntoViewIfNeeded();
  await hold(page);
});
