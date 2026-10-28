#!/usr/bin/env node
// คิดคะแนนจาก eval/results/<label>.raw.json (+ eval/judgments.json ถ้ามี) → eval/results/<label>.json ตาม web/app/api/admin/eval/SCHEMA.md
//   node eval/score.mjs --label mock-rerank-on [--judgments eval/judgments.json] [--post http://localhost:4601] [--no-db]
// · faithfulness ของชุด rag อ่านข้อความหน้าที่ค้นได้จาก doc_chunks ($DATABASE_URL) · --no-db = ไม่คิด faithfulness (null)
// · judgments: ผู้ตัดสินสุ่มตรวจแล้ว override คะแนนอัตโนมัติ (ใช้เมื่อ answer_sha ตรงกับคำตอบปัจจุบันเท่านั้น)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  cer, faithfulness, mean, privacyOk, ragCorrectness, refuses, retrievalMetrics, valueScore,
} from './lib/metrics.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const answerSha = (a) => createHash('sha1').update(String(a ?? '')).digest('hex').slice(0, 12);
const DOCS = ['SS-CAT-BOTTLES.pdf', 'SS-FAQ-EN.pdf', 'SS-LOGISTICS.pdf', 'SS-LOGO-PRINT.pdf', 'SS-POLICY.pdf', 'SS-QC-STANDARD.pdf', 'SS-USE-CARE.pdf'];

function parseArgs(argv) {
  const a = { label: null, judgments: path.join(here, 'judgments.json'), post: null, db: true, token: process.env.EVAL_TOKEN || 'ss-eval', dir: path.join(here, 'results') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--label') a.label = v();
    else if (k === '--judgments') a.judgments = v();
    else if (k === '--post') a.post = v().replace(/\/$/, '');
    else if (k === '--no-db') a.db = false;
    else if (k === '--token') a.token = v();
    else if (k === '--dir') a.dir = v();
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

/** ข้อความของหน้าที่ค้นได้ (filename+page) จาก doc_chunks */
async function pageTexts(raw) {
  const pg = (await import('../web/node_modules/pg/lib/index.js')).default;
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const rows = (await db.query('SELECT filename, page, string_agg(content, E\'\\n\' ORDER BY chunk_index) AS text FROM doc_chunks GROUP BY filename, page')).rows;
  await db.end();
  return new Map(rows.map((r) => [`${r.filename}#${r.page}`, r.text]));
}

function applyJudgment(j, answer, metrics, notes) {
  if (!j) return null;
  if (j.answer_sha && j.answer_sha !== answerSha(answer)) { notes.stale++; return null; }
  notes.used++;
  for (const k of ['correctness', 'faithfulness', 'context_retention']) if (typeof j[k] === 'number') metrics[k] = j[k];
  return j.reason ?? '';
}

export function scoreRun(raw, { judgments = {}, pages = null } = {}) {
  const notes = { used: 0, stale: 0 };
  const items = [];
  for (const it of raw.items) {
    const j = judgments[it.id];
    if (it.set === 'rag') {
      const c = ragCorrectness(it);
      const r = retrievalMetrics(it);
      const src = pages ? (it.retrieved || []).slice(0, 4).map((x) => pages.get(`${x.filename}#${x.page}`) || '').join('\n') : null;
      const metrics = { ...r, correctness: c.score, faithfulness: faithfulness(it.answer, src, it.question) };
      let reason = c.reason;
      if (r.hit_at_4 === 0) reason = [reason, `หน้า ${it.pages.join(',')} ไม่อยู่ใน top 4`].filter(Boolean).join(' · ');
      const jr = applyJudgment(j, it.answer, metrics, notes);
      if (jr != null) reason = jr || (metrics.correctness === 1 ? '' : reason);
      items.push({ id: it.id, set: 'rag', doc: it.doc, type: it.type, lang: it.lang, pass: metrics.correctness === 1,
        question: it.question, expected: it.expected, answer: it.answer, cites: it.cites, retrieved: (it.retrieved || []).slice(0, 4),
        pages: it.pages, metrics, reason, judged: jr != null, error: it.error || undefined });
    } else if (it.set === 'qa') {
      const v = valueScore(it.answer, it.expected_values);
      const metrics = { exact_value: v.score == null ? null : v.exact, sql_correct: it.sql && v.score != null ? v.exact : null, privacy_ok: null, correctness: v.score };
      let reason = v.missing?.length ? `ไม่พบค่า ${v.missing.map((m) => [].concat(m)[0]).join(', ')}` : '';
      if (it.type === 'privacy') {
        const p = privacyOk(it.answer, it.forbidden);
        metrics.privacy_ok = p.ok;
        metrics.correctness = p.ok && refuses(it.answer) ? 1 : 0;
        reason = p.leaked.length ? `เปิดเผยข้อมูลบริษัทอื่น: ${p.leaked.join(', ')}` : refuses(it.answer) ? '' : 'ไม่ได้ปฏิเสธ/แจ้งว่าไม่พบ';
      } else if (it.refuse) {
        metrics.correctness = refuses(it.answer) ? 1 : 0;
        reason = metrics.correctness ? '' : 'ควรปฏิเสธ/แจ้งว่าไม่มี';
      }
      if (!String(it.answer || '').trim()) { metrics.correctness = 0; reason = it.error || 'ไม่มีคำตอบ'; }
      const jr = applyJudgment(j, it.answer, metrics, notes);
      if (jr != null) reason = jr || (metrics.correctness === 1 ? '' : reason);
      items.push({ id: it.id, set: 'qa', doc: null, type: it.type, lang: it.lang, pass: metrics.correctness === 1,
        question: it.question, expected: it.expected, answer: it.answer, cites: it.cites || [], retrieved: (it.retrieved || []).slice(0, 4),
        metrics, reason, judged: jr != null, error: it.error || undefined });
    } else if (it.set === 'conv') {
      const tj = j?.turns || {};
      const turns = it.turns.map((t, i) => {
        const v = valueScore(t.answer, t.expected_values);
        let correctness = v.score ?? 0, reason = v.missing?.length ? `ไม่พบค่า ${v.missing.map((m) => [].concat(m)[0]).join(', ')}` : '';
        if (t.error && !String(t.answer || '').trim()) { correctness = 0; reason = t.error; }
        const jt = tj[String(i + 1)];
        let judged = false;
        if (jt && (!jt.answer_sha || jt.answer_sha === answerSha(t.answer))) { correctness = jt.correctness; reason = jt.reason ?? reason; judged = true; notes.used++; }
        else if (jt) notes.stale++;
        const stt_cer = t.audio ? cer(t.reference, t.stt?.text || '') : null;
        return { question: t.question, audio: t.audio || null, reference: t.reference, stt_text: t.stt?.text ?? null, stt_via: t.stt?.via ?? null,
          expected: t.expected, answer: t.answer, cites: t.cites || [], refers_back: !!t.refers_back, pass: correctness === 1,
          metrics: { correctness, stt_cer }, reason, judged };
      });
      const back = turns.filter((t) => t.refers_back);
      const metrics = {
        correctness: mean(turns.map((t) => t.metrics.correctness)),
        context_retention: back.length ? mean(back.map((t) => (t.metrics.correctness === 1 ? 1 : 0))) : null,
        stt_cer: mean(turns.map((t) => t.metrics.stt_cer)),
      };
      if (j && typeof j.context_retention === 'number') metrics.context_retention = j.context_retention;
      const failed = turns.map((t, i) => (t.pass ? null : `รอบ ${i + 1}: ${t.reason || 'ผิด'}`)).filter(Boolean);
      items.push({ id: it.id, set: 'conv', doc: null, type: it.type, lang: it.lang, pass: turns.every((t) => t.pass),
        question: it.question, expected: it.expected, answer: turns.map((t) => t.answer).join('\n---\n'),
        cites: turns.flatMap((t) => t.cites), metrics, reason: j?.reason || failed.join(' · '), turns, judged: !!j, error: it.error || undefined });
    }
  }

  const of = (set) => items.filter((i) => i.set === set);
  const m = (list, k) => mean(list.map((i) => i.metrics[k]));
  const rag = of('rag'), qa = of('qa'), conv = of('conv');
  const voiceTurns = conv.flatMap((c) => c.turns).filter((t) => t.audio);
  const summary = {
    rag: rag.length ? { n: rag.length, hit_at_4: m(rag, 'hit_at_4'), mrr: m(rag, 'mrr'), citation_acc: m(rag, 'citation_acc'), faithfulness: m(rag, 'faithfulness'), correctness: m(rag, 'correctness') } : { n: 0, hit_at_4: null, mrr: null, citation_acc: null, faithfulness: null, correctness: null },
    qa: qa.length ? { n: qa.length, correctness: m(qa, 'correctness'), exact_value: m(qa, 'exact_value'), sql_correct: m(qa, 'sql_correct'), privacy_ok: m(qa, 'privacy_ok') } : { n: 0, correctness: null, exact_value: null, sql_correct: null, privacy_ok: null },
    conv: conv.length ? { n: conv.length, context_retention: m(conv, 'context_retention'), stt_cer: mean(voiceTurns.map((t) => t.metrics.stt_cer)), correctness: m(conv, 'correctness') } : { n: 0, context_retention: null, stt_cer: null, correctness: null },
  };
  const by_doc = DOCS.map((doc) => {
    const l = rag.filter((i) => i.doc === doc);
    return { doc, n: l.length, correctness: m(l, 'correctness') ?? 0, hit_at_4: m(l, 'hit_at_4'), mrr: m(l, 'mrr'), citation_acc: m(l, 'citation_acc'), faithfulness: m(l, 'faithfulness') };
  }).filter((d) => d.n > 0);
  const types = new Map();
  for (const i of items) { const k = `${i.set}:${i.type}`; if (!types.has(k)) types.set(k, []); types.get(k).push(i); }
  const by_type = [...types].sort(([a], [b]) => a.localeCompare(b)).map(([type, l]) => {
    const row = { type, n: l.length, correctness: m(l, 'correctness') ?? 0 };
    if (type.startsWith('rag:')) Object.assign(row, { hit_at_4: m(l, 'hit_at_4'), mrr: m(l, 'mrr') });
    if (type.startsWith('qa:')) Object.assign(row, { exact_value: m(l, 'exact_value') });
    return row;
  });
  const config = { ...raw.config, judged_items: notes.used, stale_judgments: notes.stale, scored_at: new Date().toISOString() };
  delete config.base;
  return { label: raw.label, config, summary, by_doc, by_type, items };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.label) { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 6).join('\n')); process.exit(2); }
  const raw = JSON.parse(readFileSync(path.join(args.dir, `${args.label}.raw.json`), 'utf8'));
  const bad = raw.items.filter((i) => i.error);
  if (bad.length) console.warn(`⚠️ ${bad.length} ข้อมี error ตอนเก็บคำตอบ (นับเป็นผิด): ${bad.slice(0, 5).map((i) => i.id).join(', ')}`);
  const judgments = args.judgments && existsSync(args.judgments) ? JSON.parse(readFileSync(args.judgments, 'utf8')) : {};
  delete judgments._meta;
  const pages = args.db && process.env.DATABASE_URL ? await pageTexts(raw) : null;
  const out = scoreRun(raw, { judgments, pages });
  const file = path.join(args.dir, `${args.label}.json`);
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`saved ${file}`);
  console.log(JSON.stringify(out.summary, null, 1));
  console.table(out.by_doc.map((d) => ({ doc: d.doc, n: d.n, correctness: d.correctness, hit_at_4: d.hit_at_4, mrr: d.mrr })));
  console.log(`judgments ใช้ ${out.config.judged_items} · ไม่ตรงคำตอบ (stale) ${out.config.stale_judgments}`);
  if (args.post) {
    const res = await fetch(`${args.post}/api/admin/eval`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-eval-token': args.token }, body: JSON.stringify(out) });
    const body = await res.text();
    console.log(`POST ${args.post}/api/admin/eval → ${res.status} ${body.slice(0, 300)}`);
    if (res.status !== 201) process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
