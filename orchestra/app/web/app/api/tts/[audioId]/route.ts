// GET /api/tts/<audioId> (T15) → audio/wav จากตาราง tts_audio (audioId = sha256 ของข้อความ+ภาษา → cache ได้ยาว) · รองรับ Range
import { takeAudioDelivery } from '@/lib/tts-delivery';
import { queryOne } from '@/lib/db';
import { fail } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { audioId: string } }) {
  const id = params.audioId || '';
  if (!/^[\w-]{1,128}$/.test(id)) return fail(404, { code: 'NOT_FOUND', message: 'ไม่พบไฟล์เสียง' });
  if (process.env.TTS_CACHE === 'off') {
    const clip = takeAudioDelivery(id);
    if (!clip) return fail(404, { code: 'NOT_FOUND', message: 'ไม่พบไฟล์เสียง' });
    return new Response(new Uint8Array(clip.wav), { headers: {
      'content-type': 'audio/wav', 'content-length': String(clip.wav.length),
      'cache-control': 'no-store', 'x-tts-engine': clip.engine,
      'x-tts-lang': clip.lang, 'x-duration-ms': String(clip.durationMs),
    } });
  }
  const row = await queryOne<{ wav: Buffer | null; duration_ms: number | null; engine: string | null; lang: string | null }>(
    'SELECT wav, duration_ms, engine, lang FROM tts_audio WHERE audio_id = $1', [id]);
  if (!row || !row.wav) return fail(404, { code: 'NOT_FOUND', message: 'ไม่พบไฟล์เสียง' });
  const wav = row.wav;
  const headers: Record<string, string> = {
    'content-type': 'audio/wav',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=86400',
    'x-tts-engine': row.engine ?? '',
    'x-tts-lang': row.lang ?? '',
    'x-duration-ms': String(row.duration_ms ?? 0),
  };
  const range = req.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, wav.length - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : wav.length - 1;
    end = Math.min(end, wav.length - 1);
    if (start > end || start >= wav.length) {
      return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${wav.length}` } });
    }
    start = Math.max(0, start);
    const part = wav.subarray(start, end + 1);
    return new Response(new Uint8Array(part), { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${wav.length}`, 'content-length': String(part.length) } });
  }
  return new Response(new Uint8Array(wav), { headers: { ...headers, 'content-length': String(wav.length) } });
}
