#!/usr/bin/env node
// Node 22 only. All workload traffic goes through the public web API.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const modes = ['chat', 'stt', 'tts', 'voice', 'mix'];
const questionSets = ['rag770', 'qa'];
// T24: deterministic PRNG for the question deck (seed is stored in result.config).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
/** Without-replacement deck shared by every session of a run. When exhausted it reshuffles
 * (new round) and every further question is counted as a repeat. */
export class QuestionDeck {
  constructor(items, seed, { uniqueOnly = false } = {}) {
    if (!items.length) throw new Error('Empty question set');
    this.uniqueOnly = uniqueOnly;
    this.items = items; this.rng = mulberry32(seed); this.order = shuffle(items, this.rng); this.pos = 0;
    this.round = 1; this.served = 0; this.repeats = 0; this.seen = new Set();
  }
  next() {
    if (this.uniqueOnly && this.pos >= this.order.length) throw new Error('QUESTION_POOL_EXHAUSTED');
    if (this.pos >= this.order.length) { this.order = shuffle(this.items, this.rng); this.pos = 0; this.round++; }
    const item = this.order[this.pos++]; this.served++;
    const repeat = this.seen.has(item.id); if (repeat) this.repeats++; else this.seen.add(item.id);
    return { ...item, repeat, round: this.round };
  }
  stats() { return { served: this.served, unique: this.seen.size, repeats: this.repeats, rounds: this.round }; }
}
/** With-replacement random pick (T20 behaviour, eval/qa.json) exposing the same interface. */
export class RandomPicker {
  constructor(items) { this.items = items; this.served = 0; this.repeats = 0; this.seen = new Set(); }
  next() {
    const item = this.items[Math.floor(Math.random() * this.items.length)]; this.served++;
    const repeat = this.seen.has(item.id); if (repeat) this.repeats++; else this.seen.add(item.id);
    return { ...item, repeat, round: 1 };
  }
  stats() { return { served: this.served, unique: this.seen.size, repeats: this.repeats, rounds: 1 }; }
}
export const langOf = text => (/[\u0E00-\u0E7F]/.test(text) ? 'th' : 'en');
export async function loadQuestions(set, base = root) {
  if (set === 'qa') return JSON.parse(await readFile(resolve(base, 'eval/qa.json'))).map(q => ({ id: q.id, question: q.question, lang: q.lang || langOf(q.question) }));
  const dir = resolve(base, 'gemini/rag-questions'), out = [];
  for (const file of (await readdir(dir)).filter(f => f.endsWith('.jsonl')).sort())
    for (const line of (await readFile(resolve(dir, file), 'utf8')).split('\n')) if (line.trim()) { const q = JSON.parse(line); out.push({ id: q.qid, question: q.question, lang: langOf(q.question) }); }
  if (new Set(out.map(q => q.id)).size !== out.length) throw new Error('Duplicate qid in rag questions');
  return out;
}
export function options(argv) {
  const o = { base: 'http://localhost:3600', mode: 'mix', users: '1,10,25,50,100,150,200,250', 'stage-sec': '120', 'think-sec': '30', label: 'mock-mix', shard: '1/1', questions: 'rag770', seed: '20261026' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (key === 'help') return { help: true };
    if (key === 'post') { o.post = true; continue; }
    if (key === 'stop-on-fail') { o.stopOnFail = true; continue; }
    if (key === 'tts-with-rerank') { o.ttsWithRerank = true; continue; }
    if (!(key in o) || !argv[i].startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Invalid argument: ${argv[i]}`);
    o[key] = argv[++i];
  }
  o.users = o.users.split(',').map(Number);
  o.stageSec = Number(o['stage-sec']); o.thinkSec = Number(o['think-sec']);
  if (!/^\d+\/\d+$/.test(o.shard)) throw new Error('shard must be i/n (1 based)');
  [o.shardIndex, o.shardCount] = o.shard.split('/').map(Number);
  if (!questionSets.includes(o.questions)) throw new Error('questions must be rag770 or qa');
  if (o.ttsWithRerank && o.mode !== 'tts') throw new Error('tts-with-rerank requires mode tts');
  if (!/^\d{1,10}$/.test(o.seed)) throw new Error('seed must be a non-negative integer');
  o.seedValue = Number(o.seed);
  if (!modes.includes(o.mode) || !o.users.length || o.users.some(n => !Number.isSafeInteger(n) || n < o.shardCount) || new Set(o.users).size !== o.users.length || o.users.some((n, i) => i && n <= o.users[i - 1]) || !Number.isFinite(o.stageSec) || o.stageSec <= 0 || !Number.isFinite(o.thinkSec) || o.thinkSec < 0 || o.shardIndex < 1 || o.shardIndex > o.shardCount || !Number.isSafeInteger(o.shardCount) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,179}$/.test(o.label)) throw new Error('Invalid mode, users, duration, shard or label');
  o.base = new URL(o.base).href.replace(/\/$/, '');
  if (!['mock', 'ai'].includes(process.env.MODE || 'mock')) throw new Error('MODE must be mock or ai');
  return o;
}
export const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)] : 0;
export async function readSSE(response, onEvent) {
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('NOT_SSE');
  let pending = ''; const decoder = new TextDecoder();
  const frame = async block => {
    const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (data) await onEvent(JSON.parse(data));
  };
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true }).replace(/\r/g, '');
    let end;
    while ((end = pending.indexOf('\n\n')) >= 0) { const block = pending.slice(0, end); pending = pending.slice(end + 2); await frame(block); }
  }
  pending += decoder.decode();
  if (pending.trim()) await frame(pending);
}
export class Session {
  constructor(base, account, token = process.env.EVAL_TOKEN || 'ss-eval') { this.base = base; this.account = account; this.token = token; this.cookies = new Map([['ss_chat', randomUUID()]]); }
  async request(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    headers.set('x-eval-token', this.token);
    const r = await fetch(`${this.base}${path}`, { ...init, headers, signal: init.signal || AbortSignal.timeout(120_000) });
    for (const cookie of r.headers.getSetCookie()) { const pair = cookie.split(';')[0], i = pair.indexOf('='); this.cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
    return r;
  }
  json(path, body) { return this.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  async login() { const r = await this.json('/api/auth/login', this.account); if (!r.ok) throw new Error(`LOGIN_HTTP_${r.status}`); await r.arrayBuffer(); if (!this.cookies.get('ss_session')) throw new Error('LOGIN_NO_SESSION'); }
}
export async function queueSnapshot(api = process.env.MQ_API || 'http://localhost:15672', prefix = process.env.MQ_PREFIX || '') {
  const auth = Buffer.from(`${process.env.MQ_USER || 'guest'}:${process.env.MQ_PASSWORD || 'guest'}`).toString('base64');
  const r = await fetch(`${api.replace(/\/$/, '')}/api/queues`, { headers: { authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`MQ_HTTP_${r.status}`);
  const queues = await r.json(), result = {};
  for (const kind of ['chat', 'stt', 'tts']) {
    const q = queues.find(q => q.name === `${prefix}${kind}.request` && q.vhost === (process.env.MQ_VHOST || '/'));
    if (!q) throw new Error(`Missing queue: ${prefix}${kind}.request`);
    result[kind] = { ready: q.messages_ready || 0, unacked: q.messages_unacknowledged || 0, total: q.messages || 0, consumers: q.consumers || 0, publish: q.message_stats?.publish || 0 };
  }
  return { at: new Date().toISOString(), ...result };
}
async function audio(session, id) {
  const r = await session.request(`/api/tts/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`AUDIO_HTTP_${r.status}`);
  const reader = r.body.getReader(); const first = await reader.read();
  if (first.done || !first.value.length) throw new Error('EMPTY_AUDIO');
  const at = performance.now();
  // Drain the response like a player downloading the WAV.
  while (!(await reader.read()).done) { /* consume */ }
  return at;
}
export async function transaction(session, kind, qa, voices, counts) {
  const t0 = performance.now(), m = { kind, started_at: new Date().toISOString() };
  try {
    // Text questions are drawn only when the transaction actually sends text.
    const draw = () => { const q = typeof qa.next === 'function' ? qa.next() : qa[Math.floor(Math.random() * qa.length)]; m.question_id = q.id; if (q.repeat) m.question_repeat = true; return q; };
    let text, lang = 'th';
    if (kind === 'chat' || kind === 'tts') { const q = draw(); text = q.question; lang = q.lang || 'th'; }
    if (kind === 'stt' || kind === 'voice') {
      const v = voices[Math.floor(Math.random() * voices.length)]; m.voice_file = v.file;
      const form = new FormData(); form.set('audio', new Blob([v.bytes], { type: 'audio/wav' }), v.file);
      const r = await session.request('/api/voice', { method: 'POST', body: form });
      if (!r.ok) throw new Error(`STT_HTTP_${r.status}`);
      const j = await r.json(); if (!j.text?.trim()) throw new Error('EMPTY_STT');
      text = j.text; lang = j.language || v.lang || 'th'; m.stt_ms = performance.now() - t0;
      m.stt_rtf = m.stt_ms / v.durationMs;
      if (kind === 'stt') { m.delay_ms = m.stt_ms; m.ok = true; return m; }
    }
    if (kind === 'tts') {
      const r = await session.json('/api/tts', { text: `${text} ${text}`, lang });
      if (!r.ok) throw new Error(`TTS_HTTP_${r.status}`);
      const j = await r.json(); if (!j.audioId) throw new Error('NO_AUDIO_ID');
      m.first_audio_ms = (await audio(session, j.audioId)) - t0;
      m.delay_ms = performance.now() - t0;
      if (j.durationMs > 0) m.tts_rtf = m.delay_ms / j.durationMs;
      m.ok = true; return m;
    }
    counts.chat_attempted++;
    const r = await session.json('/api/chat', { text, lang, via: kind === 'voice' ? 'voice' : 'text', tts: kind === 'voice' });
    // Accepted HTTP streams are tracked separately from broker publish counters.
    if (r.ok) counts.chat_accepted++;
    m.message_id = r.headers.get('x-message-id');
    let done = false, streamError, firstAudio, doneAt; let chars = 0;
    const audios = [], sentences = new Map(), audioSequences = new Set();
    const ttsRtfs = [];
    await readSSE(r, e => {
      if (Number.isFinite(e.usage?.completion_tokens)) m.completion_tokens = e.usage.completion_tokens;
      if (e.type === 'error') streamError = e.text || 'SSE_ERROR';
      if (e.type === 'delta' && e.text) { m.ttft_ms ??= performance.now() - t0; chars += e.text.length; }
      if (e.type === 'done') {
        counts.chat_done++;
        if (done) streamError = 'DUPLICATE_DONE';
        done = true; doneAt = performance.now();
      }
      if (e.type === 'sentence') sentences.set(e.seq, performance.now());
      if (e.type === 'tts' && e.audioId) {
        audioSequences.add(e.seq);
        audios.push(audio(session, e.audioId).then(at => { firstAudio = Math.min(firstAudio ?? Infinity, at); if (e.durationMs > 0 && sentences.has(e.seq)) ttsRtfs.push((at - sentences.get(e.seq)) / e.durationMs); }).catch(error => { streamError = error.message; }));
      }
    });
    await Promise.all(audios);
    if (streamError) throw new Error(`SSE_ERROR: ${streamError}`);
    if (!done) throw new Error('MISSING_DONE');
    m.completion_ms = doneAt - t0; m.output_chars = chars;
    if (ttsRtfs.length) m.tts_rtf = percentile(ttsRtfs, .95);
    if (kind === 'voice') {
      if (!firstAudio) throw new Error('MISSING_TTS');
      if ([...sentences.keys()].some(seq => !audioSequences.has(seq))) throw new Error('MISSING_TTS_SENTENCE');
      m.first_audio_ms = firstAudio - t0; m.delay_ms = m.first_audio_ms;
    } else m.delay_ms = m.completion_ms;
    m.ok = true;
  } catch (e) { m.ok = false; m.error = e.message; m.delay_ms = performance.now() - t0; }
  return m;
}
function wavDuration(bytes) {
  for (let i = 12; i + 8 <= bytes.length;) {
    const n = bytes.readUInt32LE(i + 4);
    if (bytes.toString('ascii', i, i + 4) === 'fmt ') {
      const rate = bytes.readUInt32LE(i + 16);
      for (let j = i + 8 + n + n % 2; j + 8 <= bytes.length;) {
        const size = bytes.readUInt32LE(j + 4);
        if (bytes.toString('ascii', j, j + 4) === 'data') return size / rate * 1000;
        j += 8 + size + size % 2;
      }
    }
    i += 8 + n + n % 2;
  }
  throw new Error('Cannot read fixture WAV duration');
}
export async function main(argv = process.argv.slice(2)) {
  const o = options(argv);
  if (o.help) { console.log('node loadtest/run_load.mjs --base URL --mode chat|stt|tts|voice|mix --users 1,10,25,50,100,150,200,250 --stage-sec 120 --think-sec 30 --label mock-mix [--questions rag770|qa] [--seed N] [--shard i/n] [--post]'); return; }
  const criteria = JSON.parse(await readFile(resolve(root, 'loadtest/criteria.json')));
  const questionItems = await loadQuestions(o.questions);
  const qa = o.questions === 'rag770' ? new QuestionDeck(questionItems, o.seedValue, { uniqueOnly: process.env.MODE === 'ai' }) : new RandomPicker(questionItems);
  const accounts = Object.values(JSON.parse(await readFile(resolve(root, 'eval/accounts.json')))).filter(a => a?.email);
  const voiceMeta = JSON.parse(await readFile(resolve(root, 'e2e/voice-fixtures/questions.json')));
  const voices = await Promise.all(voiceMeta.map(async v => { const bytes = await readFile(resolve(root, 'e2e/voice-fixtures', v.file)); return { ...v, bytes, durationMs: wavDuration(bytes) }; }));
  const result = { label: o.label, config: { mode: o.mode, environment: process.env.MODE || 'mock', think_sec: o.thinkSec, stage_sec: o.stageSec, shard: o.shard, started_at: new Date().toISOString(), mq_prefix: process.env.MQ_PREFIX || '', latency_definition: 'chat completion; stt/tts completion; voice stop-to-first-audio; mix per-transaction chat completion or voice first audio', mix_voice_probability: 0.3, mock_latency_ms: (process.env.MODE || 'mock') === 'mock' ? Number(process.env.MOCK_LATENCY_MS || 800) : null, token_metric: 'output_chars only; SSE has no token usage' }, stages: [], max_users_ok: { [o.mode]: 0 } };
  const output = resolve(root, 'loadtest/results', `${o.label}${o.shardCount > 1 ? `.shard-${o.shardIndex}-of-${o.shardCount}` : ''}.json`);
  await mkdir(dirname(output), { recursive: true });
  const save = () => writeFile(output, JSON.stringify(result, null, 2) + '\n');
  // Fail before starting workload if queue observability is unavailable.
  const initialQueues = await queueSnapshot();
  if (process.env.T23_RESOURCE_TOPOLOGY) result.config.resource_topology = JSON.parse(process.env.T23_RESOURCE_TOPOLOGY);
  result.config.observed_consumers = Object.fromEntries(['chat', 'stt', 'tts'].map(k => [k, initialQueues[k].consumers]));
  result.config.prefetch_hint = { chat: Number(process.env.CHAT_PREFETCH || 4), stt: Number(process.env.STT_PREFETCH || 4), tts: Number(process.env.TTS_PREFETCH || 2) };
  // T24: what the stack was started with (same env as compose); headline numbers need cache off + 4/4/2.
  result.config.prefetch = { ...result.config.prefetch_hint };
  result.config.cache = (process.env.RAG_CANDIDATE_CACHE || 'off') === 'on' ? 'on' : 'off';
  result.config.tts_cache = process.env.TTS_CACHE === 'off' ? 'off' : 'on';
  result.config.tts_rerank_load = o.ttsWithRerank ? 'one concurrent real web chat per TTS transaction; chat publish/done included; TTS latency measured independently' : null;
  result.config.questions = o.questions;
  result.config.question_source = o.questions === 'rag770' ? 'gemini/rag-questions/*.jsonl (shuffled by seed, without replacement across all sessions; reshuffle + count repeats when exhausted)' : 'eval/qa.json (random with replacement)';
  result.config.question_pool = questionItems.length;
  result.config.seed = o.questions === 'rag770' ? o.seedValue : null;
  result.config.voice_questions = { source: 'e2e/voice-fixtures V01-V10 (random with replacement)', pool: voices.length, repeats_expected: true };
  result.config.pass_rule = `headline (max_users_strict): p95_ms <= ${criteria.p95_ms} && error_rate < ${criteria.error_rate}; stage.pass = T19 schema (error_rate <= ${criteria.error_rate})`;
  result.max_users_strict = { [o.mode]: 0 }; let strictOpen = true;
  result.config.unique_questions = 0; result.config.repeats = 0;
  let capacityOpen = true;
  const seenVoiceFiles = new Set(); let voiceServed = 0;
  for (const users of o.users) {
    const ids = Array.from({ length: users }, (_, i) => i).filter(i => i % o.shardCount === o.shardIndex - 1);
    const sessions = [];
    // Bound login bursts, but keep all sessions distinct and persistent across requests.
    for (let i = 0; i < ids.length; i += 10) sessions.push(...await Promise.all(ids.slice(i, i + 10).map(async id => { const s = new Session(o.base, accounts[id % accounts.length]); await s.login(); return s; })));
    const samples = [], queueSamples = [], queueErrors = [], counts = { chat_attempted: 0, chat_accepted: 0, chat_done: 0 };
    const before = await queueSnapshot(); queueSamples.push(before);
    const deckBefore = qa.stats();
    const t0 = performance.now(), deadline = t0 + o.stageSec * 1000;
    let polling = false;
    const poll = async () => { if (polling) return; polling = true; try { queueSamples.push(await queueSnapshot()); } catch (e) { queueErrors.push(e.message); } finally { polling = false; } };
    const timer = setInterval(poll, 2000);
    try {
      await Promise.all(sessions.map(async session => {
        while (performance.now() < deadline) {
          const kind = o.mode === 'mix' ? (Math.random() < 0.3 ? 'voice' : 'chat') : o.mode;
          if (o.ttsWithRerank) {
            const auxiliary = transaction(session, 'chat', qa, voices, counts);
            const sample = await transaction(session, kind, qa, voices, counts);
            sample.rerank_chat = await auxiliary;
            if (!sample.rerank_chat.ok) { sample.ok = false; sample.error = `RERANK_CHAT: ${sample.rerank_chat.error}`; }
            samples.push(sample);
          } else samples.push(await transaction(session, kind, qa, voices, counts));
          const remaining = deadline - performance.now();
          if (remaining > 0) await sleep(Math.min(remaining, o.thinkSec * 1000 * (0.5 + Math.random())));
        }
      }));
    } finally { clearInterval(timer); }
    const elapsed = performance.now() - t0;
    // RabbitMQ management statistics normally refresh every 5s. Keep the workload
    // stopped for 6s before recording the final cumulative publish counter.
    await sleep(6000); await poll();
    const after = queueSamples.at(-1), ok = samples.filter(s => s.ok).length, err = samples.length - ok;
    const values = key => samples.map(s => s[key]).filter(Number.isFinite);
    const stage = { users, local_users: ids.length, mode: o.mode, n: samples.length, ok, err, error_rate: err / samples.length,
      p50_ms: percentile(values('delay_ms'), .5), p95_ms: percentile(values('delay_ms'), .95),
      ttft_p50_ms: percentile(values('ttft_ms'), .5), ttft_p95_ms: percentile(values('ttft_ms'), .95),
      completion_p95_ms: percentile(values('completion_ms'), .95), first_audio_p95_ms: percentile(values('first_audio_ms'), .95),
      stt_rtf_p95: percentile(values('stt_rtf'), .95), tts_rtf_p95: percentile(values('tts_rtf'), .95),
      tokens_per_sec: values('completion_tokens').length === samples.filter(s => s.completion_ms !== undefined).length && values('completion_tokens').length > 0 ? values('completion_tokens').reduce((a, b) => a + b, 0) / (elapsed / 1000) : null,
      output_chars_per_sec: values('output_chars').reduce((a, b) => a + b, 0) / (elapsed / 1000), elapsed_ms: elapsed,
      queue_max: Object.fromEntries(['chat', 'stt', 'tts'].map(k => [k, Math.max(...queueSamples.map(s => s[k].total))])),
      counts: { ...counts, broker_chat_publish: after.chat.publish - before.chat.publish }, queue_samples: queueSamples, queue_errors: queueErrors, samples };
    stage.telemetry_valid = queueErrors.length === 0;
    stage.by_kind = Object.fromEntries([...new Set(samples.map(s => s.kind))].map(kind => {
      const subset = samples.filter(s => s.kind === kind);
      return [kind, { n: subset.length, err: subset.filter(s => !s.ok).length, p50_ms: percentile(subset.map(s => s.delay_ms), .5), p95_ms: percentile(subset.map(s => s.delay_ms), .95) }];
    }));
    const deckAfter = qa.stats(), stageIds = samples.flatMap(s => [s.question_id, s.rerank_chat?.question_id]).filter(Boolean);
    const voiceFiles = samples.map(s => s.voice_file).filter(Boolean);
    stage.questions = { served: deckAfter.served - deckBefore.served, repeats: deckAfter.repeats - deckBefore.repeats,
      unique_in_stage: new Set(stageIds).size, repeats_within_stage: stageIds.length - new Set(stageIds).size, deck_round: deckAfter.rounds,
      voice_served: voiceFiles.length, voice_unique: new Set(voiceFiles).size };
    for (const file of voiceFiles) { seenVoiceFiles.add(file); voiceServed++; }
    Object.assign(result.config.voice_questions, { served: voiceServed, unique_questions: seenVoiceFiles.size, repeats: voiceServed - seenVoiceFiles.size });
    stage.questions.voice_repeats = voiceFiles.length - new Set(voiceFiles).size;
    result.config.unique_questions = deckAfter.unique; result.config.repeats = deckAfter.repeats; result.config.questions_served = deckAfter.served;
    stage.message_conservation = stage.counts.broker_chat_publish === counts.chat_done && counts.chat_accepted === counts.chat_done;
    if (samples.some(s => s.error === 'QUESTION_POOL_EXHAUSTED')) {
      result.config.capacity_censored = true;
      result.config.censored_reason = '770 unique questions exhausted; failing stage is runner-limited, not a measured GPU ceiling';
    }
    stage.pass = stage.p95_ms <= criteria.p95_ms && stage.error_rate <= criteria.error_rate; // T19 schema (/api/admin/load re-checks)
    // T24 headline rule: error strictly below 1% and p95 <= 12 s (differs from pass only at exactly 1.00%).
    stage.pass_strict = stage.p95_ms <= criteria.p95_ms && stage.error_rate < criteria.error_rate;
    if (!stage.pass_strict) strictOpen = false;
    if (strictOpen) result.max_users_strict[o.mode] = users;
    stage.target_200_pass = users === 200 ? stage.pass && stage.error_rate < .01 && stage.message_conservation && stage.telemetry_valid : null;
    if (!stage.pass) capacityOpen = false;
    if (capacityOpen) result.max_users_ok[o.mode] = users;
    result.stages.push(stage); await save();
    console.log(JSON.stringify({ users, n: stage.n, error_rate: stage.error_rate, p95_ms: stage.p95_ms, pass: stage.pass, counts: stage.counts, queue_max: stage.queue_max, questions: stage.questions }));
    if (o.stopOnFail && !stage.pass_strict) {
      result.config.stopped_on_failed_stage = users;
      result.config.remaining_users = o.users.filter(n => n > users);
      break;
    }
  }
  result.config.finished_at = new Date().toISOString(); await save();
  if (o.post) {
    if (o.shardCount > 1) throw new Error('Merge shard samples before posting; shard-local percentiles are not global capacity');
    const response = await fetch(`${o.base}/api/admin/load`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-eval-token': process.env.EVAL_TOKEN || 'ss-eval' }, body: JSON.stringify(result), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`POST_LOAD_HTTP_${response.status}`);
    const posted = await response.json(); console.log(JSON.stringify({ posted_run_id: posted.run?.id, output }));
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
