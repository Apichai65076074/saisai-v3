import { test, expect } from '@playwright/test';
import { reset, hold } from '../lib/helpers';
// T13/T15 are not merged: play a real PCM WAV through the allowed test hook.
function wav() {
  const rate = 16000, count = rate * 3, bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) bytes.writeInt16LE(Math.round(Math.sin(i / rate * Math.PI * 440) * (0.08 + .22 * (.5 + .5 * Math.sin(i / rate * 14))) * 32767), 44 + i * 2);
  return `data:audio/wav;base64,${bytes.toString('base64')}`;
}
test.beforeEach(async ({ request }) => { await reset(request); });
test('D02 mascot four states and measured RMS at least ten times per second', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // T15 status endpoint is absent in this branch; isolate the D-series rendering contract.
  if ((await page.request.get('/api/tts/status')).status() === 404) {
    await page.route('**/api/tts/status', route => route.fulfill({ json: { enabled: true } }));
  }
  await page.goto('/'); await page.getByTestId('chat-open').click();
  const mascot = page.getByTestId('mascot');
  await expect(mascot.locator('canvas')).toBeVisible();
  await expect(mascot).toHaveAttribute('data-state', 'idle');
  await page.waitForFunction(() => !!(window as any).__saisaiMascot);
  for (const state of ['listening', 'thinking']) {
    await page.evaluate(s => (window as any).__saisaiMascot.state(s), state);
    await expect(mascot).toHaveAttribute('data-state', state);
  }
  await page.evaluate(() => {
    (window as any).__mouthSamples = [];
    new MutationObserver(records => { for (const r of records) if (r.attributeName === 'data-mouth') (window as any).__mouthSamples.push({ t: performance.now(), value: Number((r.target as HTMLElement).dataset.mouth) }); }).observe(document.querySelector('[data-testid="mascot"]')!, { attributes: true });
  });
  await page.evaluate(url => (window as any).__saisaiMascot.play(url), wav());
  await expect(mascot).toHaveAttribute('data-state', 'talking');
  await page.waitForTimeout(1800);
  const samples = await page.evaluate(() => (window as any).__mouthSamples as { t: number; value: number }[]);
  const positive = samples.filter(s => s.value > 0);
  expect(positive.length).toBeGreaterThanOrEqual(15);
  expect(new Set(positive.map(s => s.value)).size).toBeGreaterThan(3);
  const span = positive.at(-1)!.t - positive[0].t;
  expect((positive.length - 1) / (span / 1000)).toBeGreaterThanOrEqual(10);
  await expect(mascot).toHaveAttribute('data-state', 'idle');
  await expect(mascot).toHaveAttribute('data-mouth', '0.00');
  await hold(page); expect(errors).toEqual([]);
});
