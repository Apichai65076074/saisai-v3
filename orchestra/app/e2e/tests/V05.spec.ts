import { test, expect } from '@playwright/test';
import { reset, hold, login } from '../lib/helpers';
import { openChat } from '../lib/chat';
import { installFakeMic, assertVoiceTurn, saveVoiceMp4 } from '../lib/fake-mic';
import { readFile } from 'node:fs/promises';
import { VOICE_DIR } from '../lib/env';
import path from 'node:path';
test.beforeEach(async ({ request }) => { await reset(request); });
test.afterEach(async ({ page }, info) => {
  if (!page.isClosed()) await info.attach('voice-debug', { body: JSON.stringify(await page.evaluate(() => window.__voiceMetrics)), contentType: 'application/json' });
});
test('V05 real microphone pipeline', async ({ page }, info) => {
  test.setTimeout(300_000);
  await installFakeMic(page);
  await page.goto('/'); await openChat(page);
  await expect(page.getByTestId('voice-mode')).toBeVisible();
  await page.getByTestId('tts-auto').check();
  await page.getByTestId('voice-mode').uncheck();
  const oversized = await page.request.post('/api/voice', { multipart: { audio: { name: 'large.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) } } });
  expect(oversized.status()).toBe(413);
  const empty = await page.request.post('/api/voice', { multipart: { audio: { name: 'empty.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(0) } } });
  expect(empty.status()).toBe(422); expect((await empty.json()).error).toBe('ไม่ได้ยินเสียง ลองพูดอีกครั้งค่ะ');
  await page.evaluate(() => window.__startVoiceCapture());
  const fixtures = JSON.parse(await readFile(path.join(VOICE_DIR, 'questions.json'), 'utf8'));
  const rounds = [];
  rounds.push(await assertVoiceTurn(page, fixtures.find((f: { file: string }) => f.file === 'V07.wav'), /800/i, false));
  await info.attach('all-rounds', { body: JSON.stringify(rounds, null, 2), contentType: 'application/json' });
  await hold(page); await saveVoiceMp4(page, info);
});
