// ตรรกะของ POST /api/chat ที่ไม่พึ่ง Next (T10) — แยกไว้ให้ทดสอบได้ตรง ๆ
// companyId/userId มาจาก session ฝั่ง server เท่านั้น · priority · backpressure · ติดตาม done + tts ที่ค้าง
import { PRIORITY } from '../../../shared/mq-topology.mjs';

export const CHAT_MAX_LEN = 2000;
export const CHAT_TIMEOUT_MS = 90_000;
/** หลัง done รอ tts ของประโยคที่ประกาศไว้อีกได้นานสุด */
export const TTS_GRACE_MS = 20_000;

export const TEXT = {
  waiting: 'รอคิว…',
  thinking: 'กำลังคิด…',
  position: (n: number) => `รอคิว ลำดับที่ ${n}`,
  timeout: 'ขออภัยค่ะ ระบบตอบช้า ลองใหม่อีกครั้งนะคะ',
  mqDown: 'ขออภัยค่ะ ระบบแชทขัดข้องชั่วคราว ลองใหม่อีกครั้งนะคะ',
  busy: 'ระบบหนาแน่น ลองใหม่ใน 30 วิ',
} as const;

export type Via = 'text' | 'voice';
export type ChatBody = { text: string; lang?: 'th' | 'en'; via: Via; tts: boolean };
export type SessionLike = { userId: number; companyId: number | null; lang?: 'th' | 'en' } | null;

/** ตรวจ body · คืน error code เมื่อผิด (companyId/userId/sessionId ใน body ถูกละทิ้งเสมอ) */
export function parseChatBody(body: Record<string, unknown>): ChatBody | { error: 'TEXT_REQUIRED' | 'TEXT_TOO_LONG' } {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return { error: 'TEXT_REQUIRED' };
  if (text.length > CHAT_MAX_LEN) return { error: 'TEXT_TOO_LONG' };
  const lang = body.lang === 'th' || body.lang === 'en' ? body.lang : undefined;
  return { text, ...(lang ? { lang } : {}), via: body.via === 'voice' ? 'voice' : 'text', tts: body.tts === true };
}

/** priority ของ chat.request: x-eval-token ถูก → 0 · เสียง 3 · ข้อความ 1 */
export function chatPriority(via: Via, evalOk: boolean): number {
  if (evalOk) return PRIORITY.eval;
  return via === 'voice' ? PRIORITY.voice : PRIORITY.text;
}

export type Backpressure = {
  /** ok = ปกติ · queue = แจ้งลำดับคิว · no-tts = ตอบข้อความ ไม่สร้างเสียง · busy = 429 */
  level: 'ok' | 'queue' | 'no-tts' | 'busy';
  capacity: number;
  depth: number;
  /** ลำดับของคำขอนี้ในคิว (depth + 1) */
  position: number;
  /** ข้อความ status แรกที่ SSE ส่ง */
  status: string;
};

/**
 * backpressure ตาม PROBLEM 4.2: ความจุรวม = consumer × prefetch (ไม่มี consumer → นับเป็น 1 ตัว ให้คำขอยังเข้าคิวได้ · Q02)
 * depth > 2× → "รอคิว ลำดับที่ n" · > 4× → ไม่สร้างเสียง · > 8× → 429
 */
export function backpressure(depth: number | null, consumers: number, prefetch: number): Backpressure {
  const d = depth ?? 0;
  const capacity = Math.max(consumers, 1) * Math.max(prefetch, 1);
  const position = d + 1;
  let level: Backpressure['level'] = 'ok';
  if (d > 8 * capacity) level = 'busy';
  else if (d > 4 * capacity) level = 'no-tts';
  else if (d > 2 * capacity) level = 'queue';
  const status = level !== 'ok' ? TEXT.position(position) : consumers === 0 ? TEXT.waiting : TEXT.thinking;
  return { level, capacity, depth: d, position, status };
}

export type ChatRequest = {
  sessionId: string;
  messageId: string;
  text: string;
  lang?: 'th' | 'en';
  via: Via;
  userId?: number;
  companyId?: number;
  tts: boolean;
};

/** payload ของ chat.request · userId/companyId จาก session ฝั่ง server เท่านั้น */
export function buildChatRequest(a: { sessionId: string; messageId: string; body: ChatBody; session: SessionLike; lang?: 'th' | 'en'; tts: boolean }): ChatRequest {
  const lang = a.body.lang ?? a.lang;
  return {
    sessionId: a.sessionId,
    messageId: a.messageId,
    text: a.body.text,
    ...(lang ? { lang } : {}),
    via: a.body.via,
    ...(a.session ? { userId: a.session.userId } : {}),
    ...(a.session && a.session.companyId !== null ? { companyId: a.session.companyId } : {}),
    tts: a.tts,
  };
}

/**
 * นับว่าคำตอบจบหรือยัง: ต้องได้ done/error และ (ถ้าขอเสียง) tts ของทุก sentence ที่ประกาศไว้
 * ใช้คู่กับ rpc({isFinal: t.isFinal}) · หลัง done ถ้ายังรอ tts ให้ตั้งเวลา TTS_GRACE_MS แล้วจบเอง
 */
export function replyTracker(tts: boolean) {
  const sentences = new Set<number>();
  const voiced = new Set<number>();
  let finished: 'done' | 'error' | null = null;
  const t = {
    get finished() {
      return finished;
    },
    /** sentence ที่ยังไม่ได้เสียง */
    pendingTts(): number[] {
      return tts ? [...sentences].filter((s) => !voiced.has(s)) : [];
    },
    see(m: { type?: string; seq?: unknown }) {
      const seq = typeof m.seq === 'number' ? m.seq : Number.NaN;
      if (m.type === 'sentence' && Number.isFinite(seq)) sentences.add(seq);
      else if (m.type === 'tts' && Number.isFinite(seq)) voiced.add(seq);
      else if (m.type === 'done' && !finished) finished = 'done';
      else if (m.type === 'error' && !finished) finished = 'error';
    },
    isFinal(m: { type?: string; seq?: unknown }): boolean {
      t.see(m);
      if (finished === 'error') return true;
      return finished === 'done' && t.pendingTts().length === 0;
    },
  };
  return t;
}
