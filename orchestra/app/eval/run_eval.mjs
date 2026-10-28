#!/usr/bin/env node
// ยิงชุดประเมินผ่าน web API (ทางเดียวกับผู้ใช้จริง) แล้วเก็บคำตอบดิบ → eval/results/<label>.raw.json
//   node eval/run_eval.mjs --base http://localhost:4601 --set rag|qa|conv|all --label mock-rerank-on [--concurrency 4]
//        [--rerank on|off] [--mode mock|ai] [--limit N] [--ids A,B] [--resume] [--stt-url URL]
// · ทุกข้อ/ทุกบทใช้ chat session (cookie ss_chat) ใหม่ · รอบในบทเดียวกันใช้ session เดิม
// · header x-eval-token → priority 0 (ไม่แย่งคิวผู้ใช้จริง)
// · qa/conv ที่ระบุ now/login: reset วันที่ระบบ (POST /api/test/reset) ทีละกลุ่ม แล้วล็อกอินบัญชีทดสอบ
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

export function parseArgs(argv) {
  const a = { base: 'http://localhost:3600', set: 'all', label: null, concurrency: 4, rerank: process.env.RERANK || 'on',
    mode: process.env.MODE || 'mock', limit: 0, ids: null, resume: false, token: process.env.EVAL_TOKEN || 'ss-eval',
    sttUrl: process.env.STT_URL || null, timeoutMs: 100_000, out: path.join(here, 'results') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--base') a.base = v().replace(/\/$/, '');
    else if (k === '--set') a.set = v();
    else if (k === '--label') a.label = v();
    else if (k === '--concurrency') a.concurrency = Math.max(1, Number(v()));
    else if (k === '--rerank') a.rerank = v();
    else if (k === '--mode') a.mode = v();
    else if (k === '--limit') a.limit = Number(v());
    else if (k === '--ids') a.ids = new Set(v().split(','));
    else if (k === '--resume') a.resume = true;
    else if (k === '--token') a.token = v();
    else if (k === '--stt-url') a.sttUrl = v().replace(/\/$/, '');
    else if (k === '--timeout') a.timeoutMs = Number(v()) * 1000;
    else if (k === '--out') a.out = v();
    else if (k === '-h' || k === '--help') a.help = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** login บัญชีทดสอบ → cookie ss_session (สตริง "ss_session=...") */
export async function login(base, email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} → HTTP ${res.status}`);
  const cookies = res.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => c.startsWith('ss_session='));
  if (!cookies.length) throw new Error(`login ${email}: no ss_session cookie`);
  return cookies[0];
}

export async function resetClock(base, now) {
  const res = await fetch(`${base}/api/test/reset`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(now ? { now } : {}),
  });
  if (!res.ok) throw new Error(`reset → HTTP ${res.status}`);
  return res.json();
}

/** POST /api/chat แล้วอ่าน SSE จน done/error · คืนคำตอบ + cites/retrieved/products */
export async function ask(base, text, { sessionId, auth, lang, via = 'text', token, timeoutMs = 100_000 } = {}) {
  const cookie = [`ss_chat=${sessionId}`, lang ? `lang=${lang}` : null, auth].filter(Boolean).join('; ');
  const t0 = Date.now();
  const out = { text: '', cites: [], retrieved: [], products: [], quoteNo: null, status: [], error: null, ms: 0, ttft_ms: null, http: 0 };
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-eval-token': token, cookie },
        body: JSON.stringify({ text, lang, via, tts: false }),
      });
      out.http = res.status;
      if (res.status === 429 || res.status === 503) { clearTimeout(timer); await sleep(3000 * (attempt + 1)); continue; }
      if (!res.ok || !res.body) { out.error = `HTTP ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300); clearTimeout(timer); break; }
      let buf = '', deltas = '', done = null;
      const dec = new TextDecoder();
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let m; try { m = JSON.parse(line.slice(6)); } catch { continue; }
          if (m.type === 'status') out.status.push(m.text);
          else if (m.type === 'delta') { if (out.ttft_ms == null) out.ttft_ms = Date.now() - t0; deltas += m.text || ''; }
          else if (m.type === 'done' || m.type === 'error') {
            done = m;
            if (m.type === 'error') out.error = m.text || 'error';
          }
        }
        if (done) break;
      }
      clearTimeout(timer);
      ctrl.abort();
      if (!done) { out.error = out.error || 'stream ended without done'; break; }
      out.text = (done.type === 'done' && typeof done.text === 'string' && done.text.trim()) ? done.text : deltas;
      out.cites = done.cites || [];
      out.retrieved = done.retrieved || [];
      out.products = done.products || [];
      out.quoteNo = done.quoteNo || null;
      if (done.type === 'error') out.text = out.text || done.text || '';
      break;
    } catch (e) {
      clearTimeout(timer);
      out.error = e.name === 'AbortError' ? `timeout ${timeoutMs} ms` : String(e.message || e);
      break;
    }
  }
  out.ms = Date.now() - t0;
  return out;
}

/** ถอดเสียงผ่าน POST /api/voice (ทางผู้ใช้จริง) · ถ้า web ยังไม่มี endpoint (404) และมี --stt-url → เรียก STT ตรง */
export async function transcribe(base, wavPath, { auth, sttUrl } = {}) {
  const bytes = readFileSync(wavPath);
  const form = () => { const f = new FormData(); f.append('audio', new Blob([bytes], { type: 'audio/wav' }), path.basename(wavPath)); return f; };
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/voice`, { method: 'POST', body: form(), headers: auth ? { cookie: auth } : {} });
    if (res.ok) { const j = await res.json(); return { text: j.text || '', language: j.language, via: 'web', ms: Date.now() - t0 }; }
    if (res.status === 422) return { text: '', via: 'web', ms: Date.now() - t0 };
    if (!(res.status === 404 || res.status === 503) || !sttUrl) return { text: '', via: 'web', error: `HTTP ${res.status}`, ms: Date.now() - t0 };
  } catch (e) {
    if (!sttUrl) return { text: '', via: 'web', error: String(e.message || e), ms: Date.now() - t0 };
  }
  const f = new FormData();
  f.append('file', new Blob([bytes], { type: 'audio/wav' }), path.basename(wavPath));
  const res = await fetch(`${sttUrl}/v1/audio/transcriptions`, { method: 'POST', body: f });
  if (!res.ok) return { text: '', via: 'stt-direct', error: `HTTP ${res.status}`, ms: Date.now() - t0 };
  const j = await res.json();
  return { text: j.text || '', language: j.language, via: 'stt-direct', ms: Date.now() - t0 };
}

async function pool(items, n, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; await fn(items[i], i); }
  }));
}

const load = (f) => JSON.parse(readFileSync(path.join(here, f), 'utf8'));
const accounts = () => load('accounts.json');

async function authFor(args, cache, account) {
  if (!account) return null;
  if (!cache.has(account)) {
    const acc = accounts()[account];
    if (!acc) throw new Error(`unknown account ${account}`);
    cache.set(account, await login(args.base, acc.email, acc.password));
  }
  return cache.get(account);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.label) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 8).join('\n'));
    process.exit(args.help ? 0 : 2);
  }
  const sets = args.set === 'all' ? ['rag', 'qa', 'conv'] : args.set.split(',');
  mkdirSync(args.out, { recursive: true });
  const file = path.join(args.out, `${args.label}.raw.json`);
  const prev = args.resume && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const done = new Map((prev?.items || []).filter((i) => !i.error).map((i) => [`${i.set}:${i.id}`, i]));
  const raw = {
    label: args.label,
    config: { rerank: args.rerank, mode: args.mode, base: args.base, concurrency: args.concurrency, sets, k: 4,
      llm: process.env.LLM_MODEL || 'mock', embed: 'multilingual-e5-small' },
    started_at: prev?.started_at || new Date().toISOString(), finished_at: null, items: [],
  };
  const items = [...done.values()];
  const save = () => { raw.items = items; writeFileSync(file, JSON.stringify(raw, null, 1)); };
  const pick = (list) => {
    let l = list.filter((x) => !args.ids || args.ids.has(x.id));
    if (args.limit) l = l.slice(0, args.limit);
    return l;
  };
  const authCache = new Map();
  let count = 0, errors = 0;
  const tick = (set, item, r) => {
    count++;
    if (r.error) errors++;
    if (count % 20 === 0 || r.error) {
      console.log(`[${set}] ${count} ${item.id} ${r.error ? `ERROR ${r.error}` : `${r.ms} ms`}`);
      save();
    }
  };

  // ---- rag: ไม่ล็อกอิน วันที่ระบบตามค่าเริ่มต้น
  if (sets.includes('rag')) {
    await resetClock(args.base);
    authCache.clear();
    const list = pick(load('rag.json')).filter((q) => !done.has(`rag:${q.id}`));
    console.log(`rag: ${list.length} ข้อ`);
    await pool(list, args.concurrency, async (q) => {
      const r = await ask(args.base, q.question, { sessionId: randomUUID(), lang: q.lang, token: args.token, timeoutMs: args.timeoutMs });
      items.push({ set: 'rag', id: q.id, doc: q.doc, type: q.type, lang: q.lang, question: q.question, expected: q.expected,
        pages: q.pages, fact_ids: q.fact_ids, answer: r.text, cites: r.cites, retrieved: r.retrieved, products: r.products,
        ms: r.ms, ttft_ms: r.ttft_ms, error: r.error });
      tick('rag', q, r);
    });
    save();
  }

  // ---- qa: กลุ่มตาม now (reset ทีละกลุ่ม) · ล็อกอินตาม account
  if (sets.includes('qa')) {
    const list = pick(load('qa.json')).filter((q) => !done.has(`qa:${q.id}`));
    console.log(`qa: ${list.length} ข้อ`);
    const groups = new Map();
    for (const q of list) { const k = q.now || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); }
    for (const [now, group] of groups) {
      await resetClock(args.base, now || undefined);
      authCache.clear();
      await pool(group, args.concurrency, async (q) => {
        const auth = await authFor(args, authCache, q.account);
        const r = await ask(args.base, q.question, { sessionId: randomUUID(), auth, lang: q.lang, token: args.token, timeoutMs: args.timeoutMs });
        items.push({ set: 'qa', id: q.id, doc: null, type: q.type, lang: q.lang, account: q.account || null, now: q.now || null,
          question: q.question, expected: q.expected, expected_values: q.expected_values, forbidden: q.forbidden || [],
          refuse: !!q.refuse, sql: !!q.sql, products_expected: q.products || [], answer: r.text, cites: r.cites, retrieved: r.retrieved,
          products: r.products, quoteNo: r.quoteNo, ms: r.ms, ttft_ms: r.ttft_ms, error: r.error });
        tick('qa', q, r);
      });
    }
    save();
  }

  // ---- conv: บทละ session เดียว · รอบเสียงถอดผ่าน /api/voice
  if (sets.includes('conv')) {
    const list = pick(load('conv.json')).filter((c) => !done.has(`conv:${c.id}`));
    console.log(`conv: ${list.length} บท`);
    const groups = new Map();
    for (const c of list) { const k = c.now || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    for (const [now, group] of groups) {
      await resetClock(args.base, now || undefined);
      authCache.clear();
      // บทที่สร้างใบเสนอราคาเรียงลำดับไม่ขนานกัน (เลข QT ต่อเนื่อง) — ใช้ concurrency ตามค่าแต่ทำทีละบท
      await pool(group, args.concurrency, async (c) => {
        const auth = await authFor(args, authCache, c.account);
        const sessionId = randomUUID();
        const turns = [];
        let err = null, ms = 0;
        for (const t of c.turns) {
          let text = t.text, stt = null;
          if (t.audio) {
            stt = await transcribe(args.base, path.join(root, 'e2e/voice-fixtures', t.audio), { auth, sttUrl: args.sttUrl });
            text = stt.text;
            if (!text) { turns.push({ ...t, question: '', stt, answer: '', error: stt.error || 'empty transcript' }); err = err || 'stt failed'; continue; }
          }
          const r = await ask(args.base, text, { sessionId, auth, lang: c.lang, via: t.audio ? 'voice' : 'text', token: args.token, timeoutMs: args.timeoutMs });
          ms += r.ms;
          if (r.error) err = err || r.error;
          turns.push({ ...t, question: text, reference: t.audio ? t.reference : undefined, audio: t.audio || null, stt,
            expected: t.expected, expected_values: t.expected_values || [], refers_back: !!t.refers_back,
            answer: r.text, cites: r.cites, retrieved: r.retrieved, products: r.products, quoteNo: r.quoteNo, ms: r.ms, error: r.error });
        }
        items.push({ set: 'conv', id: c.id, doc: null, type: c.type, lang: c.lang, account: c.account || null, now: c.now || null,
          question: c.title, expected: c.turns.map((t) => t.expected).join(' / '), turns, ms, error: err });
        tick('conv', c, { ms, error: err });
      });
    }
    save();
  }

  raw.finished_at = new Date().toISOString();
  save();
  const bad = items.filter((i) => i.error);
  console.log(`saved ${file} · items ${items.length} · errors ${bad.length}`);
  if (bad.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
