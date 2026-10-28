import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { reset, login, hold } from '../lib/helpers';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/load-run-a.json', import.meta.url), 'utf8'));
const failing: number[] = fixture.stages.filter((s: { pass: boolean }) => !s.pass).map((s: { users: number }) => s.users);
const RED = 'rgb(198, 40, 40)';

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test('L02 failing stage is red and the chart has the 200-user target line', async ({ page }) => {
  expect(failing).toEqual([250]);
  await login(page, 'wichai@saisai.test');
  const r = await page.request.post('/api/admin/load', { data: fixture }); // owner cookie
  expect(r.status(), await r.text()).toBe(201);
  const { run } = await r.json();

  await page.goto(`/admin/load?runs=${run.id}`);
  const chart = page.locator('.load-page > figure [data-testid="load-chart"]');
  await expect(chart).toHaveAttribute('data-points', '8');

  // ตาราง: ขั้นไม่ผ่านเป็นสีแดง · ขั้นผ่านไม่แดง
  const bad = page.locator(`[data-testid="load-stage-table"][data-run-id="${run.id}"]`).locator('[data-testid="load-stage-row"][data-pass="false"]');
  await expect(bad).toHaveCount(failing.length);
  await expect(bad).toHaveAttribute('data-users', '250');
  await expect(bad).toContainText('ไม่ผ่าน');
  await expect(bad.locator('td').first()).toHaveCSS('color', RED);
  await expect(bad.locator('td').first()).toHaveCSS('background-color', 'rgb(253, 231, 231)');
  const good = page.locator(`[data-testid="load-stage-table"][data-run-id="${run.id}"]`).locator('[data-testid="load-stage-row"][data-pass="true"]');
  await expect(good).toHaveCount(7);
  await expect(good.first().locator('td').first()).not.toHaveCSS('color', RED);

  // กราฟ: จุดขั้น 250 แดง + แถบแดง + ป้ายแกน X แดง
  const badPoint = chart.locator('[data-series="p95_ms"] circle[data-users="250"]');
  await expect(badPoint).toHaveAttribute('data-pass', 'false');
  await expect(badPoint).toHaveAttribute('fill', '#C62828');
  await expect(chart.getByTestId('load-fail-band')).toHaveAttribute('data-users', '250');
  await expect(chart.locator('text', { hasText: '250 ✗' })).toHaveCSS('fill', RED);

  // เส้นเป้า 200 · เส้นเกณฑ์ 12 วิ · เส้นตั้งที่ N
  const target = chart.getByTestId('load-target-line');
  await expect(target).toHaveAttribute('data-value', '200');
  await expect(target).toContainText('เป้า 200 คน');
  const targetX = Number(await target.locator('line').getAttribute('x1'));
  const x200 = Number(await chart.locator('[data-series="p95_ms"] circle[data-users="200"]').getAttribute('cx'));
  expect(Math.abs(targetX - x200)).toBeLessThan(0.5);
  await expect(chart.getByTestId('load-criteria-line')).toHaveAttribute('data-value', '12000');
  await expect(chart.getByTestId('load-n-line')).toHaveAttribute('data-value', String(fixture.max_users_ok.mix));
  await bad.scrollIntoViewIfNeeded();
  await hold(page);
});
