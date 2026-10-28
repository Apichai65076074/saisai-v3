import test from 'node:test';
import assert from 'node:assert/strict';
import { speech } from '../lib/audio.mjs';
test('provider TTS_CACHE=off never returns a previously synthesized buffer', async () => {
  const old = { cache: process.env.TTS_CACHE, espeak: process.env.ESPEAK_BIN };
  process.env.ESPEAK_BIN = '/nonexistent-cold-proof-espeak';
  try {
    process.env.TTS_CACHE = 'on';
    const warm = await speech('cold provider regression proof', 'en');
    assert.strictEqual(await speech('cold provider regression proof', 'en'), warm);
    process.env.TTS_CACHE = 'off';
    const a = await speech('cold provider regression proof', 'en');
    const b = await speech('cold provider regression proof', 'en');
    assert.notStrictEqual(a, warm); assert.notStrictEqual(a, b);
    assert.equal(a.toString('ascii', 0, 4), 'RIFF');
  } finally {
    if (old.cache === undefined) delete process.env.TTS_CACHE; else process.env.TTS_CACHE = old.cache;
    if (old.espeak === undefined) delete process.env.ESPEAK_BIN; else process.env.ESPEAK_BIN = old.espeak;
  }
});
