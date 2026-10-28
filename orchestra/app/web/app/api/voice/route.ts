// POST /api/voice (T15) multipart `audio` (+ `lang?` th|en) → stt.request → stt-worker → {text, language, durationMs}
// > 2 MB → 413 · ไม่มี consumer → 503 · ถอดไม่ได้/ว่าง → 422 {error:'ไม่ได้ยินเสียง ลองพูดอีกครั้งค่ะ'} · ช้า → 504
import { rpc, consumerCount, RpcTimeoutError } from '@/lib/mq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;
const STT_TIMEOUT_MS = 30_000;
const TEXT = {
  notHeard: 'ไม่ได้ยินเสียง ลองพูดอีกครั้งค่ะ',
  tooLarge: 'ไฟล์เสียงใหญ่เกิน 2 MB (พูดได้ไม่เกิน 30 วินาที)',
  noAudio: 'ไม่พบไฟล์เสียง',
  disabled: 'ระบบฟังเสียงยังไม่พร้อม ลองพิมพ์คำถามแทนนะคะ',
  slow: 'ระบบฟังเสียงตอบช้า ลองใหม่อีกครั้งค่ะ',
};

const err = (status: number, code: string, error: string) =>
  Response.json({ ok: false, error, errors: [{ code, message: error, field: 'audio' }] }, { status });

export async function POST(req: Request) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BYTES + 64 * 1024) return err(413, 'AUDIO_TOO_LARGE', TEXT.tooLarge);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err(400, 'AUDIO_REQUIRED', TEXT.noAudio);
  }
  const audio = form.get('audio');
  if (!audio || typeof audio === 'string') return err(400, 'AUDIO_REQUIRED', TEXT.noAudio);
  if (audio.size > MAX_BYTES) return err(413, 'AUDIO_TOO_LARGE', TEXT.tooLarge);
  if (audio.size === 0) return err(422, 'NOT_HEARD', TEXT.notHeard);
  if ((await consumerCount('stt.request')) === 0) return err(503, 'VOICE_DISABLED', TEXT.disabled);

  const lang = form.get('lang');
  const payload = {
    audioB64: Buffer.from(await audio.arrayBuffer()).toString('base64'),
    mime: audio.type || 'audio/webm',
    ...(lang === 'th' || lang === 'en' ? { lang } : {}),
  };
  try {
    const r = await rpc('stt.request', payload, { timeoutMs: STT_TIMEOUT_MS, isFinal: (m) => m.type === 'stt' });
    const text = typeof r.text === 'string' ? r.text.trim() : '';
    if (r.error || !text) return err(422, 'NOT_HEARD', TEXT.notHeard);
    return Response.json({ text, language: r.language === 'en' ? 'en' : 'th', durationMs: Number(r.durationMs) || 0 });
  } catch (e) {
    if (e instanceof RpcTimeoutError) return err(504, 'STT_TIMEOUT', TEXT.slow);
    return err(503, 'MQ_DOWN', TEXT.disabled);
  }
}
