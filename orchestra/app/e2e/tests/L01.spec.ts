import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { reset, loginUI, hold } from '../lib/helpers';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/load-run-a.json', import.meta.url), 'utf8'));

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test('L01 POST load-run-a.json → load-chart 8 points and load-max-users from the file', async ({ page, request }) => {
  const r = await request.post('/api/admin/load', { data: fixture, headers: { 'x-eval-token': process.env.EVAL_TOKEN || 'ss-eval' } });
  expect(r.status(), await r.text()).toBe(201);
  const { run } = await r.json();
  expect(run.max_users_ok).toEqual(fixture.max_users_ok);

  await loginUI(page, 'wichai@saisai.test');
  await page.goto('/admin/load');
  const select = page.getByTestId('load-run-select');
  await expect(select.locator(`option[value="${run.id}"]`)).toContainText(fixture.label);
  await select.selectOption(String(run.id));

  const selectedRun = page.locator(`.load-run[data-run-id="${run.id}"]`);
  const scale = page.getByTestId('load-scale-comparison');
  await expect(scale.getByTestId('load-scale-card')).toHaveCount(3);
  for (const name of ['scale-base', 'scale-x2', 'scale-x4']) {
    await expect(scale.locator(`[data-scale="${name}"]`)).toHaveCount(1);
  }
  await scale.getByTestId('load-scale-mode').selectOption('chat');
  await expect(scale).toHaveAttribute('data-mode', 'chat');
  for (const curve of await scale.getByTestId('load-chart').all()) await expect(curve).toHaveAttribute('data-mode', 'chat');
  await scale.getByTestId('load-scale-mode').selectOption('mix');
  await expect(scale).toHaveAttribute('data-mode', 'mix');
  const chart = page.locator('.load-page > figure [data-testid="load-chart"]');
  await expect(chart).toHaveCount(1);
  await expect(chart).toHaveAttribute('data-points', String(fixture.stages.length));
  await expect(chart).toHaveAttribute('data-points', '8');
  await expect(chart.locator('[data-series="p95_ms"] circle')).toHaveCount(8);

  const modes = Object.keys(fixture.max_users_ok);
  await expect(selectedRun.getByTestId('load-max-users')).toHaveCount(modes.length);
  for (const mode of modes) {
    const card = selectedRun.locator(`[data-testid="load-max-users"][data-mode="${mode}"]`);
    await expect(card).toHaveAttribute('data-value', String(fixture.max_users_ok[mode]));
    await expect(card).toHaveText(String(fixture.max_users_ok[mode]));
  }
  await expect(selectedRun.locator('.load-big').first()).toContainText(`รองรับพร้อมกันได้ ${fixture.max_users_ok.mix} คน`);
  await expect(page.getByTestId('load-criteria')).toContainText('p95 ≤ 12 วิ · error ≤ 1%');
  await expect(page.locator(`[data-testid="load-stage-table"][data-run-id="${run.id}"]`).getByTestId('load-stage-row')).toHaveCount(8);
  await chart.scrollIntoViewIfNeeded();
  await hold(page);
});
