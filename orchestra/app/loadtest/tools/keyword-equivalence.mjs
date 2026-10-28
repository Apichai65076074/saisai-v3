#!/usr/bin/env node
// T24: proves the pruned keyword search returns exactly the full-scan top 20 (ids, order, similarity values)
// for every question, and reports both timings. Run inside a chat-worker container (needs pg + DATABASE_URL):
//   docker cp loadtest/tools/keyword-equivalence.mjs saisai3-chat-worker-1:/app/workers/chat-worker/tools/
//   docker cp /tmp/questions.json saisai3-chat-worker-1:/tmp/questions.json   # [{id, question}] (see loadtest/README.md)
//   docker exec saisai3-chat-worker-1 node tools/keyword-equivalence.mjs /tmp/questions.json > result.json
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { searchTerms, keywordFullScan, keywordPruned } from '../lib/retrieve.mjs';
const require = createRequire(import.meta.url);
let pg; try { pg = require('pg'); } catch { pg = require('/app/web/node_modules/pg'); }
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const questions = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const P = (a, p) => { a = [...a].sort((x, y) => x - y); return Math.round(a[Math.max(0, Math.ceil(a.length * p) - 1)] * 10) / 10; };
const full = [], pruned = [], scored = [], mismatches = [];
for (const q of questions) {
  const { terms } = searchTerms(q.question);
  let t = performance.now(); const a = (await keywordFullScan(pool, terms)).rows; full.push(performance.now() - t);
  t = performance.now(); const b = await keywordPruned(pool, terms); pruned.push(performance.now() - t);
  scored.push(b.pruning.scored);
  const same = a.length === b.rows.length && a.every((r, i) => Number(r.id) === Number(b.rows[i].id) && r.similarity === b.rows[i].similarity);
  if (!same) mismatches.push({ id: q.id, full: a.map(r => [r.id, r.similarity]), pruned: b.rows.map(r => [r.id, r.similarity]) });
}
await pool.end();
console.log(JSON.stringify({ questions: questions.length, identical: questions.length - mismatches.length, mismatches,
  fullscan_ms: { p50: P(full, .5), p95: P(full, .95), max: P(full, 1) }, pruned_ms: { p50: P(pruned, .5), p95: P(pruned, .95), max: P(pruned, 1) },
  chunks_scored: { p50: P(scored, .5), p95: P(scored, .95), max: P(scored, 1) } }, null, 1));
