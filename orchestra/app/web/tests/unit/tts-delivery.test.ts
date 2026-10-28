import { afterEach, expect, test, vi } from 'vitest';
import { acceptAudioDelivery, takeAudioDelivery } from '../../lib/tts-delivery';
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
test('cold delivery strips MQ bytes and permits exactly one HTTP consumption', () => {
  vi.stubEnv('TTS_CACHE', 'off');
  const reply = acceptAudioDelivery({ type: 'tts', audioId: 'cold-test', audioB64: Buffer.from('RIFF').toString('base64'), engine: 'voxcpm2', lang: 'th' });
  expect(reply).not.toHaveProperty('audioB64');
  expect(takeAudioDelivery('cold-test')?.wav.toString()).toBe('RIFF');
  expect(takeAudioDelivery('cold-test')).toBeUndefined();
});
test('abandoned audio expires instead of becoming reusable audio cache', () => {
  vi.stubEnv('TTS_CACHE', 'off'); vi.useFakeTimers();
  acceptAudioDelivery({ type: 'tts', audioId: 'expired-test', audioB64: 'UklGRg==' });
  vi.advanceTimersByTime(90_001);
  expect(takeAudioDelivery('expired-test')).toBeUndefined();
});

test('old retrieval-only results cannot be selected as a cold-TTS primary', async () => {
  const { runKind } = await import('../../app/admin/load/kind');
  const config = { cache: 'off', questions: 'rag770', prefetch: { chat: 4, stt: 4, tts: 2 } };
  expect(runKind({ label: 'T24', config }).primary).toBe(false);
  expect(runKind({ label: 'T22-cold', config: { ...config, tts_cache: 'off' } }).primary).toBe(true);
});
