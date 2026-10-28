import { test, expect } from '@playwright/test';
import { reset, hold } from '../lib/helpers';
import { openChat, askChat } from '../lib/chat';
import { stopService, startService } from '../lib/services';
test.beforeEach(async ({ request }) => { await reset(request); });
test('V06 stopped STT hides mic; text and TTS remain available; restart restores mic', async ({ page }) => {
  await page.goto('/'); await openChat(page);
  await expect(page.getByTestId('voice-mic')).toBeVisible();
  try {
    await stopService('stt-worker');
    await expect(page.getByTestId('voice-mic')).toHaveCount(0, { timeout: 20_000 });
    expect(await (await page.request.get('/api/voice/status')).json()).toEqual({ enabled: false });
    const reply = await askChat(page, 'B-500 ขั้นต่ำกี่ใบ'); expect(reply.text).toMatch(/800/);
    await expect(page.getByTestId('tts-play').last()).toBeVisible();
    expect(await (await page.request.get('/api/tts/status')).json()).toEqual({ enabled: true });
    await hold(page);
  } finally { await startService('stt-worker'); }
  await expect(page.getByTestId('voice-mic')).toBeVisible({ timeout: 30_000 });
});
