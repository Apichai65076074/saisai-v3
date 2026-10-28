import { test, expect } from '@playwright/test';
import { reset, hold } from '../lib/helpers';
import { openChat, askChat } from '../lib/chat';
import { installFakeMic, saveVoiceMp4 } from '../lib/fake-mic';
test.beforeEach(async ({ request }) => { await reset(request); });
test('T02 auto speech streams three sentences in sequence before done', async ({ page }, info) => {
  test.setTimeout(300_000);
  await installFakeMic(page); await page.goto('/'); await openChat(page);
  await page.getByTestId('tts-auto').check();
  await page.evaluate(() => window.__startVoiceCapture());
  await askChat(page, 'Please describe the bottle catalogue in three sentences.');
  await page.waitForFunction(() => window.__voiceMetrics.ended.length === 3, undefined, { timeout: 90_000 });
  const m = await page.evaluate(() => window.__voiceMetrics);
  expect(m.plays.map(p => p.seq)).toEqual([1, 2, 3]); expect(m.ended).toEqual([1, 2, 3]);
  expect(m.plays.every(p => p.duration > 1)).toBe(true);
  expect(m.plays[0].at).toBeLessThan(m.doneAt); expect(m.maxMouth).toBeGreaterThan(0);
  await expect(page.getByTestId('mascot')).toHaveAttribute('data-state', 'idle');
  await hold(page); await saveVoiceMp4(page, info);
});
