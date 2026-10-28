import test from 'node:test';
import assert from 'node:assert/strict';
import { CleanStream, Sentences, strip } from '../lib/stream.mjs';
import { rrf, rerank, retrieve } from '../lib/retrieve.mjs';

test('tags, think and citations remain hidden at every possible token split', () => {
  const input = '<think>secret [PRICE]{"x":1}</think>ราคา [PRICE]{"model":"B-250","nested":{"s":"}\\\""}} ดีค่ะ [2]';
  for (let split = 0; split <= input.length; split++) {
    let text = ''; const cites = []; const s = new CleanStream(t => text += t, n => cites.push(n));
    s.push(input.slice(0, split)); s.push(input.slice(split)); s.end();
    assert.equal(text, 'ราคา  ดีค่ะ '); assert.deepEqual(cites, [2]); assert.equal(s.tools[0].input.model, 'B-250');
  }
  assert.equal(strip('[QUOTE]{"quantity":1}<think>hidden</think>ok[1]'), 'ok');
});
test('sentence emitted before end, decimals preserved, long text capped', () => {
  const out = [], s = new Sentences(t => out.push(t));
  s.push('ใบละ 5.'); assert.equal(out.length, 0); s.push('80 บาทค่ะ ต่อไป');
  assert.deepEqual(out, ['ใบละ 5.80 บาทค่ะ']); s.push('ก'.repeat(410)); s.end();
  assert.ok(out.every(t => t.length <= 200));
});
test('RRF merges identities and limits candidates to twenty', () => {
  const a = Array.from({ length: 30 }, (_, id) => ({ id, content: String(id) }));
  const out = rrf(a, [a[2], a[1]]); assert.equal(out.length, 20); assert.equal(out[0].id, 2);
});
test('RERANK=off skips network; malformed/server errors fall back', async () => {
  const candidates = Array.from({ length: 20 }, (_, id) => ({ id, content: String(id), score: 1 }));
  assert.deepEqual(await rerank('q', candidates, { rerank: 'off', fetch() { throw Error('must not call'); } }), candidates.slice(0, 4));
  for (const fetch of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ results: [{ index: 99, score: 2 }] }) })]) {
    assert.deepEqual(await rerank('q', candidates, { fetch }), candidates.slice(0, 4));
  }
});
test('rerank >3 sec aborts and returns RRF top4', async () => {
  const candidates = [{ id: 1, content: 'one' }]; const start = Date.now();
  const out = await rerank('q', candidates, { fetch: (_url, { signal }) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: true, json: async () => [] }), 5000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); });
  }) });
  assert.deepEqual(out, candidates); assert.ok(Date.now() - start < 3600);
});
test('embedding failure preserves lexical candidates', async () => {
  const out = await retrieve({ query: async () => ({ rows: [{ id: 1, content: 'B-250' }] }) }, 'B-250', { rerank: 'off', fetch: async () => { throw Error('down'); } });
  assert.equal(out[0].content, 'B-250');
});
