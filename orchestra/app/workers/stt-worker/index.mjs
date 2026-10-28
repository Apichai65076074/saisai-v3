// stt-worker (T15): consume `stt.request` {audioB64, mime, lang?} → POST ${STT_URL}/v1/audio/transcriptions
// → reply ทาง exchange `chat.reply` (routing key = reply_to · correlation_id เดิม):
//   {type:'stt', text, language, durationMs} | {type:'stt', error}
// consume เฉพาะตอน ${STT_URL}/health ok (ตรวจทุก STT_HEALTH_EVERY_MS) · ล่ม → cancel consumer
// → web เห็น consumerCount('stt.request') = 0 → /api/voice/status {enabled:false} → ซ่อนไมค์
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import amqp from 'amqplib';
import { assertTopology, mqPrefix, prefetch, reply } from '../../shared/mq-topology.mjs';

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@rabbitmq:5672';
const STT_URL = () => (process.env.STT_URL || 'http://mock-llm:8000').replace(/\/+$/, '');
const API_KEY = () => process.env.AIBOX_API_KEY || '';
const TIMEOUT_MS = Number(process.env.STT_TIMEOUT_MS || 30_000);
const HEALTH_EVERY_MS = Number(process.env.STT_HEALTH_EVERY_MS || 5_000);
// T22: probes cross a remote tunnel; one slow /health must not drop the consumer (→ /api/voice 503)
const HEALTH_FAILS = Math.max(1, Number(process.env.STT_HEALTH_FAILS || 2));

/** true = cancel consumer · after `fails` consecutive failed probes */
export function healthGate(fails = HEALTH_FAILS) {
  let bad = 0;
  return (ok) => { bad = ok ? 0 : bad + 1; return bad >= fails; };
}
/** ≤ 2 MB เสียง (PROBLEM 4.2) */
export const MAX_BYTES = 2 * 1024 * 1024;
/** คำเฉพาะร้านช่วย Whisper (PROBLEM 4.5) */
export const INITIAL_PROMPT = 'ขวดแก้ว B-100 B-150 B-250 B-500 สีชา สีเขียว สีใส พิมพ์โลโก้ เลขล็อต เครดิต ใบเสนอราคา ใสใส กลาสแวร์';

const log = (...a) => console.log('[stt-worker]', ...a);

const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a' };
export const extFor = (mime) => EXT[String(mime || '').split(';')[0].trim().toLowerCase()] || 'webm';

/** `/health` ok และ (ถ้าบอกรายการโมเดล) มี stt */
export async function sttHealthy() {
  try {
    const r = await fetch(`${STT_URL()}/health`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return false;
    const body = await r.json().catch(() => ({}));
    if (body && body.models && typeof body.models === 'object' && !body.models.stt) return false;
    return true;
  } catch {
    return false;
  }
}

/** ความยาวของ WAV PCM (ms) · 0 ถ้าไม่ใช่ WAV */
export function wavMs(buf) {
  if (!buf || buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return 0;
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ' && size >= 12 && off + 20 <= buf.length) byteRate = buf.readUInt32LE(off + 16);
    if (id === 'data') return byteRate ? Math.round((Math.min(size, buf.length - off - 8) / byteRate) * 1000) : 0;
    off += 8 + size + (size % 2);
  }
  return 0;
}

/** ภาษาจาก Whisper ('th' 'thai' 'en' 'english' …) → 'th' | 'en' (ไม่รู้ → ดูตัวอักษร) */
export function normLang(lang, text = '') {
  const l = String(lang || '').toLowerCase();
  if (l.startsWith('th')) return 'th';
  if (l.startsWith('en')) return 'en';
  if (/[฀-๿]/.test(text)) return 'th';
  if (/[a-z]/i.test(text)) return 'en';
  return 'th';
}

/** ถอดเสียง 1 คำขอ → {text, language, durationMs} · service ล้ม → throw */
export async function transcribe({ audioB64, mime, lang }) {
  if (!audioB64 || typeof audioB64 !== 'string') throw new Error('audio_required');
  const audio = Buffer.from(audioB64, 'base64');
  if (!audio.length) throw new Error('audio_required');
  if (audio.length > MAX_BYTES) throw new Error('audio_too_large');
  if (wavMs(audio) > 30_000) throw new Error('audio_too_long');
  const type = String(mime || 'audio/webm');
  const form = new FormData();
  form.append('file', new Blob([audio], { type }), `audio.${extFor(type)}`);
  form.append('model', 'whisper');
  form.append('initial_prompt', INITIAL_PROMPT);
  if (lang === 'th' || lang === 'en') form.append('language', lang);
  form.append('response_format', 'verbose_json');
  const started = Date.now();
  const r = await fetch(`${STT_URL()}/v1/audio/transcriptions`, {
    method: 'POST',
    headers: API_KEY() ? { Authorization: `Bearer ${API_KEY()}` } : {},
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`stt_http_${r.status}`);
  const body = await r.json();
  const text = String(body.text ?? '').trim();
  // durationMs = ความยาวเสียง (duration ของ service เป็นวินาที · ไม่มี → header WAV)
  const durationMs = Number(body.duration) > 0 ? Math.round(Number(body.duration) * 1000) : wavMs(audio);
  if (durationMs > 30_000) throw new Error('audio_too_long');
  return { text, language: normLang(body.language || lang, text), durationMs, processingMs: Date.now() - started };
}

/** worker 1 ตัว · คืน {stop()} (ใช้ใน test) */
export async function start({ prefix = mqPrefix(), healthEveryMs = HEALTH_EVERY_MS, heartbeat = true } = {}) {
  let conn = null;
  let ch = null;
  let N = null;
  let consumerTag = null;
  let stopping = false;
  const timers = [];

  if (heartbeat) {
    const beat = () => { try { writeFileSync(process.env.HEARTBEAT_FILE || '/tmp/healthy', String(Date.now())); } catch { /* ไม่อยู่ใน container */ } };
    beat();
    timers.push(setInterval(beat, 10_000));
  }

  const onMessage = async (m, channel) => {
    if (!m) return; // server ยกเลิก consumer
    const send = (o) => reply(channel, m, { type: 'stt', ...o }, prefix);
    let req;
    try {
      req = JSON.parse(m.content.toString('utf8'));
    } catch {
      send({ error: 'bad_request' });
      channel.ack(m);
      return;
    }
    try {
      const out = await transcribe(req);
      send(out);
      log(`ok audio=${out.durationMs}ms took=${out.processingMs}ms lang=${out.language} chars=${out.text.length}`);
    } catch (e) {
      log('error', e?.message || e);
      send({ error: e?.name === 'TimeoutError' ? 'stt_timeout' : String(e?.message || e) });
    }
    channel.ack(m); // ack หลังทำเสร็จ (ตอบ error แล้วก็ถือว่าเสร็จ · web รอ reply อยู่)
  };

  const startConsumer = async () => {
    if (consumerTag || !ch) return;
    consumerTag = 'pending';
    const channel = ch;
    try {
      const r = await channel.consume(N.sttRequest, (m) => { onMessage(m, channel).catch(() => log('delivery interrupted · broker จะ requeue')); });
      if (ch !== channel) return;
      consumerTag = r.consumerTag;
      log(`consuming ${N.sttRequest} (prefetch ${prefetch('stt')}) · STT_URL=${STT_URL()}`);
    } catch (e) {
      consumerTag = null;
      throw e;
    }
  };
  const stopConsumer = async () => {
    if (!consumerTag || consumerTag === 'pending' || !ch) return;
    const tag = consumerTag;
    consumerTag = null;
    await ch.cancel(tag).catch(() => {});
    log('STT service ล่ม → cancel consumer (voice/status = false)');
  };
  const down = healthGate();
  const tick = async () => {
    if (!ch || stopping) return;
    const ok = await sttHealthy();
    if (ok) await startConsumer().catch((e) => log('consume failed', e?.message));
    if (down(ok)) await stopConsumer();
  };

  const connect = async () => {
    const c = await amqp.connect(AMQP_URL, { clientProperties: { connection_name: `stt-worker-${process.pid}` } });
    conn = c;
    c.on('error', () => {});
    c.on('close', () => {
      if (conn !== c) return;
      ch = null;
      consumerTag = null;
      if (stopping) return;
      log('amqp closed → reconnecting');
      setTimeout(() => connect().catch(retry), 2000);
    });
    const channel = await c.createChannel();
    channel.on('error', () => {});
    N = await assertTopology(channel, prefix);
    await channel.prefetch(prefetch('stt'));
    ch = channel;
    consumerTag = null;
    log(`connected · prefix='${prefix}'`);
    await tick();
  };
  const retry = (e) => {
    if (stopping) return;
    log('amqp connect failed:', e?.message || e);
    setTimeout(() => connect().catch(retry), 3000);
  };

  timers.push(setInterval(() => tick().catch(() => {}), healthEveryMs));
  await connect().catch(retry);

  return {
    get consuming() { return Boolean(consumerTag && consumerTag !== 'pending'); },
    async stop() {
      stopping = true;
      timers.forEach(clearInterval);
      await conn?.close().catch(() => {});
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const w = await start();
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await w.stop(); process.exit(0); });
}
