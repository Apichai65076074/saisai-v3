// Cold TTS: pending HTTP delivery, never indexed by text or reused across requests.
// RabbitMQ replies reach the web instance that owns the request. GET consumes the
// unique clip once; a 90s deadline bounds abandoned clips. Multi-web needs affinity.
type Clip = { wav: Buffer; durationMs: number; engine: string; lang: string; expires: number };
const g = globalThis as unknown as { __ssAudioDelivery?: Map<string, Clip> };
const pending = g.__ssAudioDelivery ?? (g.__ssAudioDelivery = new Map());
const MAX_BYTES = 32 * 1024 * 1024;
export function acceptAudioDelivery<T extends Record<string, unknown>>(msg: T): T {
  if (msg.type !== 'tts' || typeof msg.audioB64 !== 'string') return msg;
  const { audioB64, ...clean } = msg;
  if (process.env.TTS_CACHE !== 'off') return clean as T;
  const now = Date.now();
  let bytes = 0;
  for (const [id, clip] of pending) {
    if (clip.expires <= now) pending.delete(id);
    else bytes += clip.wav.length;
  }
  const wav = Buffer.from(audioB64, 'base64');
  if (typeof msg.audioId !== 'string' || wav.length > MAX_BYTES - bytes) {
    return { ...clean, audioId: undefined, error: 'audio_delivery_capacity' } as unknown as T;
  }
  const id = msg.audioId;
  pending.set(id, { wav, durationMs: Number(msg.durationMs) || 0,
    engine: String(msg.engine ?? ''), lang: String(msg.lang ?? ''), expires: now + 90_000 });
  const timer = setTimeout(() => pending.delete(id), 90_000);
  timer.unref();
  return clean as T;
}
export function takeAudioDelivery(id: string): Clip | undefined {
  const clip = pending.get(id);
  pending.delete(id);
  return clip && clip.expires > Date.now() ? clip : undefined;
}
