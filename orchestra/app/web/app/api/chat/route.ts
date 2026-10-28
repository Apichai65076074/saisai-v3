// POST /api/chat {text, lang?, via?, tts?} → SSE `data: <json>\n\n` (T10)
// บันทึกข้อความ user → status แรก (รอคิว…/กำลังคิด…/รอคิว ลำดับที่ n) → ส่งต่อทุก reply ของ messageId (รวม tts)
// จน done/error และ tts ของทุก sentence (หรือ 20 วิหลัง done) · timeout 90 วิ · backpressure > 8× ความจุ → 429
// userId/companyId/lang มาจาก session ฝั่ง server เท่านั้น (ไม่รับจาก body) · คำตอบ assistant บันทึกโดย chat-worker
import { randomUUID } from 'node:crypto';
import { getChatSessionId, getLang, getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { fail, readJson } from '@/lib/http';
import { consumerCount, queueStats, rpc, RpcAbortError, RpcTimeoutError, type ReplyMessage } from '@/lib/mq';
import {
  CHAT_TIMEOUT_MS, TEXT, TTS_GRACE_MS, backpressure, buildChatRequest, chatPriority, parseChatBody, replyTracker,
} from '@/lib/mq/chat';
import { prefetch } from '../../../../shared/mq-topology.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const POLL_MS = 2000; // ระหว่างรอคิว: อัปเดตลำดับ/สถานะ
const PING_MS = 15_000; // SSE comment กัน proxy ตัดการเชื่อมต่อ

export async function POST(req: Request) {
  const parsed = parseChatBody(await readJson(req));
  if ('error' in parsed) {
    return fail(parsed.error === 'TEXT_TOO_LONG' ? 413 : 400, {
      code: parsed.error,
      message: parsed.error === 'TEXT_TOO_LONG' ? 'ข้อความยาวเกินไป' : 'กรุณาพิมพ์คำถาม',
      field: 'text',
    });
  }

  const session = await getSession();
  const lang = parsed.lang ?? (await getLang());
  const sessionId = getChatSessionId() ?? randomUUID();
  const evalToken = process.env.EVAL_TOKEN || 'ss-eval';
  const evalOk = req.headers.get('x-eval-token') === evalToken;

  const [stats, ttsConsumers] = await Promise.all([
    queueStats('chat.request', true),
    parsed.tts ? consumerCount('tts.request') : Promise.resolve(0),
  ]);
  if (!stats) {
    return fail(503, { code: 'MQ_DOWN', message: TEXT.mqDown });
  }
  const bp = backpressure(stats.messageCount, stats.consumerCount, prefetch('chat'));
  if (bp.level === 'busy') {
    const res = fail(429, { code: 'BUSY', message: TEXT.busy });
    res.headers.set('Retry-After', '30');
    return res;
  }
  const tts = parsed.tts && bp.level !== 'no-tts' && ttsConsumers > 0;

  const messageId = randomUUID();
  const payload = buildChatRequest({ sessionId, messageId, body: parsed, session, lang, tts });
  await query(
    `INSERT INTO chat_sessions (id, user_id, company_id, lang) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, company_id = EXCLUDED.company_id, lang = EXCLUDED.lang`,
    [sessionId, session?.userId ?? null, session?.companyId ?? null, lang],
  );
  await query('INSERT INTO chat_messages (session_id, role, text, via, meta) VALUES ($1, $2, $3, $4, $5)', [
    sessionId, 'user', parsed.text, parsed.via, JSON.stringify({ messageId }),
  ]);

  const abort = new AbortController();
  const enc = new TextEncoder();
  let closed = false;
  let grace: NodeJS.Timeout | null = null;
  const timers: NodeJS.Timeout[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          closed = true;
        }
      };
      const emit = (m: ReplyMessage) => write(`data: ${JSON.stringify({ ...m, messageId })}\n\n`);
      const end = () => {
        timers.forEach(clearInterval);
        if (grace) clearTimeout(grace);
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* ปิดไปแล้ว */
        }
      };

      let lastStatus = bp.status;
      let picked = false; // worker รับงานแล้ว (ได้ reply แรก)
      emit({ type: 'status', text: bp.status, position: bp.position, tts });

      timers.push(setInterval(() => write(': ping\n\n'), PING_MS));
      timers.push(
        setInterval(async () => {
          if (picked || closed) return;
          const s = await queueStats('chat.request');
          if (!s || picked || closed) return;
          // ลำดับโดยประมาณ: ไม่เกินลำดับแรก และไม่เกินจำนวนที่รออยู่
          const now = backpressure(Math.min(bp.position, Math.max(s.messageCount, 1)) - 1, s.consumerCount, prefetch('chat'));
          if (now.status !== lastStatus) {
            lastStatus = now.status;
            emit({ type: 'status', text: now.status, position: now.position });
          }
        }, POLL_MS),
      );

      const tracker = replyTracker(tts);
      try {
        await rpc('chat.request', payload, {
          correlationId: messageId,
          timeoutMs: CHAT_TIMEOUT_MS,
          priority: chatPriority(parsed.via, evalOk),
          signal: abort.signal,
          onMessage: (m) => {
            picked = true;
            emit(m);
            tracker.see(m);
            if (tracker.finished === 'done' && !grace && tracker.pendingTts().length > 0) {
              // หลัง done รอเสียงประโยคที่เหลือได้อีก 20 วิ แล้วจบ
              grace = setTimeout(() => abort.abort(), TTS_GRACE_MS);
            }
          },
          isFinal: tracker.isFinal,
        });
      } catch (e) {
        if (e instanceof RpcAbortError) {
          // ผู้ใช้ปิด / หมดเวลารอ tts หลัง done
        } else if (tracker.finished) {
          /* ได้ done แล้ว แค่ tts ไม่ครบ */
        } else {
          const text = e instanceof RpcTimeoutError ? TEXT.timeout : TEXT.mqDown;
          emit({ type: 'error', text, cites: [], retrieved: [], products: [], lang });
        }
      }
      end();
    },
    cancel() {
      closed = true;
      timers.forEach(clearInterval);
      if (grace) clearTimeout(grace);
      abort.abort();
    },
  });

  req.signal?.addEventListener('abort', () => abort.abort(), { once: true });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Message-Id': messageId,
    },
  });
}
