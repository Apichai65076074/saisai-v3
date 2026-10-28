import { test, expect } from '@playwright/test';
import { reset, hold } from '../lib/helpers';
import { openChat, askChat } from '../lib/chat';
import { installFakeMic, saveVoiceMp4 } from '../lib/fake-mic';
test.beforeEach(async ({ request }) => { await reset(request); });
test('T03 English question plays English TTS', async ({ page }, info) => {
  test.setTimeout(300_000);
  await installFakeMic(page); await page.goto('/'); await openChat(page);
  await page.getByTestId('tts-auto').check();
  await page.evaluate(() => window.__startVoiceCapture());
  expect((await askChat(page, 'What is the minimum order for B-150?')).text).toMatch(/1,?800/);
  await page.waitForFunction(() => window.__voiceMetrics.ended.length > 0);
  await expect(page.getByTestId('chat-audio')).toHaveAttribute('data-lang', 'en');
  expect((await page.evaluate(() => window.__voiceMetrics)).plays[0].duration).toBeGreaterThan(1);
  await hold(page); await saveVoiceMp4(page, info);
});
