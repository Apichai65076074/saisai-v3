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
test('V03 real microphone pipeline', async ({ page }, info) => {
  test.setTimeout(600_000);
  await installFakeMic(page);
  await page.goto('/'); await openChat(page);
  await expect(page.getByTestId('voice-mode')).toBeVisible();
  await page.getByTestId('voice-mode').check();
  await page.evaluate(() => window.__startVoiceCapture());
  const fixtures = JSON.parse(await readFile(path.join(VOICE_DIR, 'questions.json'), 'utf8'));
  const rounds = [];
  rounds.push(await assertVoiceTurn(page, fixtures.find((f: { file: string }) => f.file === 'V09.wav'), /2026-10-25/i, true));
  rounds.push(await assertVoiceTurn(page, fixtures.find((f: { file: string }) => f.file === 'V06.wav'), /7\s*วัน|7\s*days/i, true));
  rounds.push(await assertVoiceTurn(page, fixtures.find((f: { file: string }) => f.file === 'V10.wav'), /3.*per model/i, true));
  rounds.push(await assertVoiceTurn(page, fixtures.find((f: { file: string }) => f.file === 'V05.wav'), /ล็อกอิน|log in/i, true));
  await info.attach('all-rounds', { body: JSON.stringify(rounds, null, 2), contentType: 'application/json' });
  await hold(page); await saveVoiceMp4(page, info, rounds);
});
