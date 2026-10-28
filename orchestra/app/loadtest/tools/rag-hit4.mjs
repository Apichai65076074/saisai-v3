#!/usr/bin/env node
// T24: retrieval-level Hit@4 / MRR over eval/rag.json (770) through retrieve() exactly as chat-worker calls it
// (embedder + trigram + RRF + rerank), once with keyword=pruned and once with keyword=fullscan. Run in a chat-worker
// container: docker exec saisai3-chat-worker-1 node /tmp/eq/tools/rag-hit4.mjs /tmp/rag.json > rag-hit4.json
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { retrieve } from '../lib/retrieve.mjs';
const require = createRequire(import.meta.url);
let pg; try { pg = require('pg'); } catch { pg = require('/app/web/node_modules/pg'); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const items = JSON.parse(readFileSync(process.argv[2], 'utf8'));
async function run(keyword) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < items.length) {
      const i = next++, it = items[i];
      const top = (await retrieve(pool, it.question, { keyword })).slice(0, 4);
      const rank = top.findIndex(r => r.filename === it.doc && it.pages.includes(Number(r.page)));
      out[i] = { id: it.id, hit: rank >= 0, rr: rank >= 0 ? 1 / (rank + 1) : 0, top: top.map(r => `${r.filename}#${r.page}`) };
    }
  }));
  return out;
}
const pruned = await run('pruned'), full = await run('fullscan');
await pool.end();
// Match T18: unanswerable/no-page items have null retrieval metrics.
const eligible = new Set(items.filter(it => it.pages?.length && it.type !== 'unanswerable').map(it => it.id));
const scoredPruned = pruned.filter(it => eligible.has(it.id)), scoredFull = full.filter(it => eligible.has(it.id));
const pct = l => Math.round(1000 * l.filter(x => x.hit).length / l.length) / 10, mrr = l => Math.round(1000 * l.reduce((a, x) => a + x.rr, 0) / l.length) / 10;
const diff = pruned.filter((p, i) => p.top.join() !== full[i].top.join()).map(p => p.id);
console.log(JSON.stringify({ n: items.length, scored_n: eligible.size, excluded_unanswerable_or_no_pages: items.length - eligible.size, rerank: process.env.RERANK ?? 'on', pruned: { hit_at_4: pct(scoredPruned), mrr: mrr(scoredPruned) }, fullscan: { hit_at_4: pct(scoredFull), mrr: mrr(scoredFull) },
  top4_differs: diff, t18_reference: { hit_at_4: 83.0, mrr: 69.5, source: 'eval/REPORT.md (mock-rerank-on, via chat API)' } }, null, 1));
