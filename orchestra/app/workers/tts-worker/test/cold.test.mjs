import test from 'node:test';
import assert from 'node:assert/strict';
import { createSynth } from '../index.mjs';
import { fakeAibox, silentWav } from '../../stt-worker/test/helpers.mjs';

test('TTS_CACHE=off: sequential + simultaneous repeats call upstream each time, zero DB/cache work', async () => {
  const old = { cache: process.env.TTS_CACHE, url: process.env.TTS_URL };
  let requests = 0;
  const box = await fakeAibox({ '/v1/audio/speech': (_req, _body, res) => {
    requests++;
    res.writeHead(200, { 'content-type': 'audio/wav' });
    res.end(silentWav(1300));
  } });
  process.env.TTS_CACHE = 'off'; process.env.TTS_URL = box.url;
  let queries = 0;
  const synth = createSynth({ query() { queries++; throw new Error('cold mode must never access tts_audio'); } });
  try {
    const a = await synth('สวัสดีค่ะ', 'th');
    const b = await synth('สวัสดีค่ะ', 'th');
    const rest = await Promise.all(Array.from({ length: 4 }, () => synth('สวัสดีค่ะ', 'th')));
    const clips = [a, b, ...rest];
    assert.equal(new Set(clips.map(v => v.audioId)).size, 6);
    assert.equal(requests, 6); assert.equal(queries, 0);
    assert.deepEqual(synth.stats, { requests: 6, upstream: 6, memoryHits: 0, dbReads: 0, dbWrites: 0, shared: 0 });
    for (const clip of clips) {
      assert.equal(clip.cached, false);
      assert.equal(Buffer.from(clip.audioB64, 'base64').toString('ascii', 0, 4), 'RIFF');
    }
    console.log('cold runtime counters', JSON.stringify(synth.stats));
  } finally {
    if (old.cache === undefined) delete process.env.TTS_CACHE; else process.env.TTS_CACHE = old.cache;
    if (old.url === undefined) delete process.env.TTS_URL; else process.env.TTS_URL = old.url;
    await box.close();
  }
});
