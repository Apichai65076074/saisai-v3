// POST /api/tts {text, lang?} (T15) → tts.request → tts-worker → {audioId, durationMs, engine, lang}
// ปุ่ม 🔊 (tts-play) และ load test โหมด tts · เสียงดึงที่ GET /api/tts/<audioId>
import { randomUUID } from 'node:crypto';
import { getLang } from '@/lib/auth';
import { fail, readJson } from '@/lib/http';
import { consumerCount, rpc, RpcTimeoutError } from '@/lib/mq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT = 4000;
const TTS_TIMEOUT_MS = 60_000;

export async function POST(req: Request) {
  const body = await readJson(req);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return fail(400, { code: 'TEXT_REQUIRED', message: 'กรุณาระบุข้อความ', field: 'text' });
  if (text.length > MAX_TEXT) return fail(413, { code: 'TEXT_TOO_LONG', message: 'ข้อความยาวเกินไป', field: 'text' });
  const lang = body.lang === 'en' || body.lang === 'th' ? body.lang : await getLang();
  if ((await consumerCount('tts.request')) === 0) return fail(503, { code: 'TTS_DISABLED', message: 'ระบบอ่านออกเสียงยังไม่พร้อม' });
  const messageId = randomUUID();
  try {
    const r = await rpc('tts.request', { messageId, seq: 1, text, lang }, { timeoutMs: TTS_TIMEOUT_MS, correlationId: messageId, isFinal: (m) => m.type === 'tts' });
    if (r.error || typeof r.audioId !== 'string') return fail(422, { code: 'TTS_FAILED', message: 'อ่านออกเสียงไม่ได้ ลองใหม่ค่ะ' });
    return Response.json({ audioId: r.audioId, durationMs: Number(r.durationMs) || 0, engine: r.engine, lang: r.lang ?? lang });
  } catch (e) {
    if (e instanceof RpcTimeoutError) return fail(504, { code: 'TTS_TIMEOUT', message: 'ระบบอ่านออกเสียงตอบช้า ลองใหม่ค่ะ' });
    return fail(503, { code: 'MQ_DOWN', message: 'ระบบอ่านออกเสียงยังไม่พร้อม' });
  }
}
