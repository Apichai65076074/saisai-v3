// tts-worker (T15): consume `tts.request` {messageId, seq, text, lang} → ทำข้อความให้พูดได้ (text.mjs)
// → cache sha256(ข้อความที่พูด + ภาษา) = audioId ใน `tts_audio` (+ หน่วยความจำ) → ไม่มี → POST ${TTS_URL}/v1/audio/speech (voice nongsai)
// → reply ทาง `chat.reply` (routing key = reply_to · correlation_id เดิม):
//   {type:'tts', messageId, seq, audioId, durationMs, engine, lang} | {type:'tts', messageId, seq, error}
// ตอนเริ่ม: สร้าง WAV ประโยคบ่อย (ทักทาย · คำถามแนะนำ · ติดต่อเซลส์) ไว้ก่อน (WARM_TEXTS)
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import amqp from 'amqplib';
import pg from 'pg';
import { assertTopology, mqPrefix, prefetch, reply } from '../../shared/mq-topology.mjs';
import { prepareSpeech } from './text.mjs';

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672';
const DATABASE_URL = process.env.DATABASE_URL || 'postgres://ss:ss@db:5432/saisai';
const TTS_URL = () => (process.env.TTS_URL || 'http://mock-llm:8000').replace(/\/+$/, '');
const API_KEY = () => process.env.AIBOX_API_KEY || '';
const TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 60_000);
export const VOICE = process.env.TTS_VOICE || 'nongsai';
const MEM_MAX = 200;
/** เสียงสั้นกว่านี้ (เช่น "ค่ะ" คำเดียว) เติมความเงียบท้ายไฟล์ ให้ทุกช่วงของ `chat-audio` ยาว > 1 วิ */
export const MIN_AUDIO_MS = Number(process.env.TTS_MIN_MS || 1200);

/** ประโยคบ่อย (ข้อความเดียวกับหน้าต่างแชท T14 + ติดต่อเซลส์ตามข้อมูลร้าน) */
export const WARM_TEXTS = [
  ['สวัสดีค่ะ ถามเรื่องขวดแก้ว ราคา หรือการสั่งซื้อได้เลยค่ะ', 'th'],
  ['มีขวดแก้วรุ่นไหนบ้าง', 'th'],
  ['สั่งซื้อขั้นต่ำกี่ใบ', 'th'],
  ['ขอตัวอย่างขวดได้อย่างไร', 'th'],
  ['ติดต่อเซลส์ได้ที่ 02-000-0000 หรือไลน์ @saisai-test ค่ะ', 'th'],
  ['Hello! Ask about our bottles, prices or ordering.', 'en'],
  ['What bottles do you sell?', 'en'],
  ['What is the minimum order?', 'en'],
  ['How can I request samples?', 'en'],
];

const log = (...a) => console.log('[tts-worker]', ...a);

/** audioId = sha256(ข้อความที่พูด + ภาษา) */
export const audioIdFor = (text, lang) => createHash('sha256').update(text + lang).digest('hex');

/** ความยาว WAV PCM (เดิน RIFF chunk) · null ถ้าไม่ใช่ WAV */
export function wavDurationMs(buf) {
  if (!buf || buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ' && size >= 12 && off + 20 <= buf.length) byteRate = buf.readUInt32LE(off + 16);
    if (id === 'data') {
      if (size === 0 || size === 0xffffffff || off + 8 + size > buf.length) size = buf.length - off - 8; // header แบบ stream
      return byteRate ? Math.round((size / byteRate) * 1000) : null;
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

/** เติมความเงียบ (PCM 0) ท้าย chunk data ให้ยาวอย่างน้อย minMs · คืน buffer เดิมถ้ายาวพอ/อ่าน header ไม่ได้ */
export function padWav(buf, minMs = MIN_AUDIO_MS) {
  const ms = wavDurationMs(buf);
  if (ms == null || ms >= minMs) return buf;
  let off = 12;
  let fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = buf.subarray(off, off + 8 + size);
    if (id === 'data') {
      if (!fmt || fmt.length < 24) return buf;
      if (size === 0 || size === 0xffffffff || off + 8 + size > buf.length) size = buf.length - off - 8;
      const byteRate = fmt.readUInt32LE(16);
      const align = fmt.readUInt16LE(20) || 1;
      const want = Math.ceil((byteRate * minMs) / 1000 / align) * align;
      const data = Buffer.alloc(Math.max(want, size));
      buf.copy(data, 0, off + 8, off + 8 + size);
      const head = Buffer.alloc(12);
      head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(4 + fmt.length + 8 + data.length, 4); head.write('WAVE', 8, 'ascii');
      const dh = Buffer.alloc(8);
      dh.write('data', 0, 'ascii'); dh.writeUInt32LE(data.length, 4);
      return Buffer.concat([head, fmt, dh, data]);
    }
    off += 8 + size + (size % 2);
  }
  return buf;
}

// engine: /health models.tts = 'mock' → 'mock' · อื่น → 'voxcpm2'
let engineCache = { v: null, at: 0 };
async function engineName() {
  if (engineCache.v && Date.now() - engineCache.at < 60_000) return engineCache.v;
  try {
    const r = await fetch(`${TTS_URL()}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await r.json().catch(() => ({}));
    engineCache = { v: String(body?.models?.tts ?? '').toLowerCase() === 'mock' ? 'mock' : 'voxcpm2', at: Date.now() };
  } catch {
    engineCache = { v: engineCache.v || 'voxcpm2', at: Date.now() - 50_000 };
  }
  return engineCache.v;
}

/** เรียก TTS service → {wav, durationMs, engine} */
export async function synthesizeRaw(text, lang) {
  const r = await fetch(`${TTS_URL()}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(API_KEY() ? { Authorization: `Bearer ${API_KEY()}` } : {}) },
    body: JSON.stringify({ model: 'voxcpm2', input: text, voice: VOICE, response_format: 'wav', language: lang }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`tts_http_${r.status}`);
  const wav = padWav(Buffer.from(await r.arrayBuffer()));
  const durationMs = wavDurationMs(wav);
  if (durationMs == null) throw new Error('tts_not_wav');
  return { wav, durationMs, engine: await engineName() };
}

/** ตัวสร้างเสียงพร้อม cache (หน่วยความจำ → DB → service) */
export function createSynth(pool) {
  const cacheEnabled = process.env.TTS_CACHE !== 'off';
  const stats = { requests: 0, upstream: 0, memoryHits: 0, dbReads: 0, dbWrites: 0, shared: 0 };

  const mem = new Map(); // audioId → {durationMs, engine, lang, wav}
  const inflight = new Map();
  const remember = (id, v) => {
    if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value);
    mem.set(id, v);
  };
  const save = (id, v) => { stats.dbWrites++; return pool.query(
    'INSERT INTO tts_audio(audio_id, wav, duration_ms, engine, lang) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (audio_id) DO NOTHING',
    [id, v.wav, v.durationMs, v.engine, v.lang],
  ); };
  /** → {audioId, durationMs, engine, lang, cached, text} */
  const synth = async function synth(raw, langHint) {
    stats.requests++;
    const { text, lang } = prepareSpeech(raw, langHint);
    if (!text) throw new Error('empty_text');
    if (!cacheEnabled) {
      stats.upstream++;
      const v = await synthesizeRaw(text, lang);
      // Unique, one-use transport to the owning web instance. No result reuse,
      // DB reads/writes, memory cache, or singleflight in cold measurements.
      return { audioId: randomUUID(), durationMs: v.durationMs, engine: v.engine,
        lang, cached: false, text, audioB64: v.wav.toString('base64') };
    }
    const audioId = audioIdFor(text, lang);
    const hit = mem.get(audioId);
    if (hit) {
      stats.memoryHits++;
      await save(audioId, hit); // ตาราง tts_audio ถูกล้างตอน /api/test/reset → ใส่กลับ
      return { audioId, durationMs: hit.durationMs, engine: hit.engine, lang, cached: true, text };
    }
    stats.dbReads++;
    const row = (await pool.query('SELECT duration_ms, engine FROM tts_audio WHERE audio_id=$1', [audioId])).rows[0];
    if (row) return { audioId, durationMs: row.duration_ms, engine: row.engine, lang, cached: true, text };
    if (!inflight.has(audioId)) {
      inflight.set(audioId, (async () => {
        stats.upstream++;
        const out = await synthesizeRaw(text, lang);
        const v = { wav: out.wav, durationMs: out.durationMs, engine: out.engine, lang };
        await save(audioId, v);
        remember(audioId, v);
        return v;
      })().finally(() => inflight.delete(audioId)));
    }
    else stats.shared++;
    const v = await inflight.get(audioId);
    return { audioId, durationMs: v.durationMs, engine: v.engine, lang, cached: false, text };
  };
  synth.stats = stats;
  return synth;
}

/** worker 1 ตัว · คืน {stop()} (ใช้ใน test) */
export async function start({ prefix = mqPrefix(), databaseUrl = DATABASE_URL, warm = process.env.TTS_WARM !== '0', heartbeat = true } = {}) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: Math.max(2, prefetch('tts') + 1) });
  pool.on('error', (e) => log('pg error', e.message));
  const synth = createSynth(pool);
  let conn = null;
  let stopping = false;
  const timers = [];

  if (heartbeat) {
    const beat = () => { try { writeFileSync(process.env.HEARTBEAT_FILE || '/tmp/healthy', String(Date.now())); } catch { /* ไม่อยู่ใน container */ } };
    beat();
    timers.push(setInterval(beat, 10_000));
  }

  const handle = async (ch, m) => {
    let req = {};
    try {
      req = JSON.parse(m.content.toString('utf8'));
      const out = await synth(req.text, req.lang);
      reply(ch, m, { type: 'tts', messageId: req.messageId, seq: req.seq, audioId: out.audioId, durationMs: out.durationMs, engine: out.engine, lang: out.lang, ...(out.audioB64 ? { audioB64: out.audioB64 } : {}) }, prefix);
      log(`ok seq=${req.seq} ${out.audioId.slice(0, 12)} ${out.durationMs}ms ${out.engine} ${out.lang}${out.cached ? ' (cache)' : ''}`);
    } catch (e) {
      log('error', e?.message || e);
      reply(ch, m, { type: 'tts', messageId: req.messageId, seq: req.seq, error: e?.name === 'TimeoutError' ? 'tts_timeout' : String(e?.message || e) }, prefix);
    }
    ch.ack(m);
  };

  const connect = async () => {
    const c = await amqp.connect(AMQP_URL, { clientProperties: { connection_name: `tts-worker-${process.pid}` } });
    conn = c;
    c.on('error', () => {});
    c.on('close', () => {
      if (conn !== c || stopping) return;
      log('amqp closed → reconnecting');
      setTimeout(() => connect().catch(retry), 2000);
    });
    const ch = await c.createChannel();
    ch.on('error', () => {});
    const N = await assertTopology(ch, prefix);
    await ch.prefetch(prefetch('tts'));
    await ch.consume(N.ttsRequest, (m) => { if (m) handle(ch, m).catch(() => log('delivery interrupted · broker จะ requeue')); });
    log(`consuming ${N.ttsRequest} (prefetch ${prefetch('tts')}) · TTS_URL=${TTS_URL()} · voice ${VOICE}`);
  };
  const retry = (e) => {
    if (stopping) return;
    log('amqp connect failed:', e?.message || e);
    setTimeout(() => connect().catch(retry), 3000);
  };

  await connect().catch(retry);

  // ประโยคบ่อย: ทำเบื้องหลัง (ไม่บล็อกคิว) · ล้มก็ข้าม
  log(`TTS_CACHE=${process.env.TTS_CACHE === 'off' ? 'off' : 'on'}`);
  const warming = warm && process.env.TTS_CACHE !== 'off'
    ? (async () => {
        let n = 0;
        for (const [t, l] of WARM_TEXTS) {
          if (stopping) break;
          try { await synth(t, l); n++; } catch (e) { log('warm skip', e?.message || e); }
        }
        log(`warm cache ${n}/${WARM_TEXTS.length}`);
      })()
    : Promise.resolve();

  return {
    synth,
    warming,
    stats: synth.stats,
    async stop() {
      stopping = true;
      log(`counters ${JSON.stringify(synth.stats)}`);
      timers.forEach(clearInterval);
      await conn?.close().catch(() => {});
      await warming.catch(() => {});
      await pool.end().catch(() => {});
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const w = await start();
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await w.stop(); process.exit(0); });
}
