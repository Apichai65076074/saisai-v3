#!/usr/bin/env node
// Real GPU preflight, distinct from primary web loads. Never prints endpoint/key.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const c = JSON.parse(await readFile(new URL('../.vast-private/runtime.json', import.meta.url)));
const endpoint = c.endpoints.tts;
const headers = { authorization: `Bearer ${c.api_key}`, 'content-type': 'application/json' };
const output = { mode: 'ai', started_at: new Date().toISOString(), transport: 'temporary HTTPS; authenticated POST; no-store', items: [] };
const save = () => writeFile(new URL('../eval/results/T22-provider-cold-proof.json', import.meta.url), JSON.stringify(output, null, 2)+'\n');
const metrics = async () => {
  const response = await fetch(`${endpoint}/metrics`, { headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`metrics HTTP${response.status}`);
  return response.json();
};
output.before = await metrics();
await save();
const unauthorized = await fetch(`${endpoint}/metrics`, { signal: AbortSignal.timeout(20000) });
output.unauthorized_status = unauthorized.status;
await unauthorized.arrayBuffer();
if (unauthorized.status !== 401) throw new Error('Bearer enforcement failed');
const rerank = await fetch(`${endpoint}/v1/rerank`, { method: 'POST', headers,
  body: JSON.stringify({ query: 'ขวดแก้ว', documents: ['ขวดแก้วสำหรับบรรจุเครื่องดื่ม', 'การขนส่งสินค้า', 'การชำระเงิน'] }), signal: AbortSignal.timeout(60000) });
if (!rerank.ok) throw new Error(`rerank HTTP${rerank.status}`);
output.rerank = await rerank.json();
await save();
for (let i = 1; i <= 3; i++) {
  const start = performance.now();
  const response = await fetch(`${endpoint}/v1/audio/speech`, { method: 'POST', headers,
    body: JSON.stringify({ input: 'สวัสดีค่ะ ยินดีต้อนรับสู่ใสใสกลาสแวร์ค่ะ', voice: 'nongsai', language: 'th' }), signal: AbortSignal.timeout(180000) });
  if (!response.ok) {
    output.failed_request = { n: i, status: response.status, elapsed_ms: performance.now()-start };
    output.after = await metrics();
    await save();
    throw new Error(`speech HTTP${response.status}`);
  }
  const wav = Buffer.from(await response.arrayBuffer());
  if (wav.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Expected genuine WAV');
  const item = { n: i, elapsed_ms: performance.now()-start, bytes: wav.length,
    duration_s: Number(response.headers.get('x-audio-duration')), generation_s: Number(response.headers.get('x-generation-seconds')),
    rtf: Number(response.headers.get('x-rtf')), cache_control: response.headers.get('cache-control'),
    cf_cache_status: response.headers.get('cf-cache-status'), sha256: createHash('sha256').update(wav).digest('hex') };
  output.items.push(item);
  await writeFile(new URL(`../eval/results/T22-provider-tts-${i}.wav`, import.meta.url), wav);
  await save();
  console.log(JSON.stringify(item));
}
output.after = await metrics();
output.tts_upstream_delta = output.after.upstream_calls.tts-output.before.upstream_calls.tts;
if (output.tts_upstream_delta !== 3) throw new Error('Repeated text must execute three GPU generations');
output.finished_at = new Date().toISOString();
await save();
console.log(JSON.stringify({ upstream_generations: output.tts_upstream_delta, cache: 'off' }));
