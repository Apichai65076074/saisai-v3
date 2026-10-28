#!/usr/bin/env node
// Exact T18 CER definition; all ten immutable voice fixtures, both Whisper models.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { cer, mean } from '../eval/lib/metrics.mjs';

const privateConfig = JSON.parse(await readFile(new URL('../.vast-private/runtime.json', import.meta.url)));
const fixtures = JSON.parse(await readFile(new URL('../e2e/voice-fixtures/questions.json', import.meta.url)));
const out = { started_at: new Date().toISOString(), mode: 'ai', definition: 'T18 normalized/clamped character Levenshtein CER',
  language_policy: process.env.STT_LANGUAGE_POLICY || 'auto-detect; unsupported language retries Thai', models: {} };
await mkdir(new URL('../eval/results/', import.meta.url), { recursive: true });
for (const model of ['large-v3', 'large-v3-turbo']) {
  const items = [];
  out.models[model] = { n: 0, mean_cer: null, items };
  for (const fixture of fixtures) {
    const form = new FormData();
    form.set('model', model);
    form.set('file', new Blob([await readFile(new URL(`../e2e/voice-fixtures/${fixture.file}`, import.meta.url))]), fixture.file);
    const started = performance.now();
    const response = await fetch('http://127.0.0.1:58082/v1/audio/transcriptions', {
      method: 'POST', headers: { authorization: `Bearer ${privateConfig.api_key}` }, body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`STT ${model} ${fixture.id} HTTP${response.status}`);
    const result = await response.json();
    items.push({ id: fixture.id, reference: fixture.text, hypothesis: result.text, language: result.language,
      duration_s: result.duration, elapsed_ms: performance.now()-started, cer: cer(fixture.text, result.text) });
    console.log(JSON.stringify({ model, id: fixture.id, cer: items.at(-1).cer }));
    out.models[model].n = items.length;
    out.models[model].mean_cer = mean(items.map(i => i.cer));
    await writeFile(new URL('../eval/results/T22-whisper-CER.json', import.meta.url), JSON.stringify(out, null, 2)+'\n');
  }
  out.models[model] = { n: items.length, mean_cer: mean(items.map(i => i.cer)), items };
  await mkdir(new URL('../eval/results/', import.meta.url), { recursive: true });
  await writeFile(new URL('../eval/results/T22-whisper-CER.json', import.meta.url), JSON.stringify(out, null, 2)+'\n');
}
out.selected = Object.entries(out.models).sort((a, b) => a[1].mean_cer-b[1].mean_cer ||
  a[1].items.reduce((n,i) => n+i.elapsed_ms,0)-b[1].items.reduce((n,i) => n+i.elapsed_ms,0))[0][0];
const selected = await fetch('http://127.0.0.1:58082/admin/stt/select', {
  method: 'POST', headers: { authorization: `Bearer ${privateConfig.api_key}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model: out.selected }), signal: AbortSignal.timeout(10000),
});
if (!selected.ok) throw new Error(`STT model selection HTTP${selected.status}`);
out.finished_at = new Date().toISOString();
await writeFile(new URL('../eval/results/T22-whisper-CER.json', import.meta.url), JSON.stringify(out, null, 2)+'\n');
console.log(JSON.stringify({ selected: out.selected, means: Object.fromEntries(Object.entries(out.models).map(([m,r]) => [m,r.mean_cer])) }));
