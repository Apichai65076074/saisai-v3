// GET /api/chat/history → {messages:[{id, role, text, cites, via, meta, createdAt}]} ของ chat session นี้ (เก่า → ใหม่ · 100 ล่าสุด) (T10)
import { getChatSessionId } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = { id: number; role: string; text: string; cites: unknown; via: string; meta: unknown; created_at: Date };

export async function GET() {
  const sessionId = getChatSessionId();
  if (!sessionId) return Response.json({ messages: [] });
  const rows = await query<Row>(
    `SELECT id, role, text, cites, via, meta, created_at FROM chat_messages WHERE session_id = $1 ORDER BY id DESC LIMIT 100`,
    [sessionId],
  );
  const messages = rows.reverse().map((r) => ({
    id: r.id, role: r.role, text: r.text, cites: r.cites ?? [], via: r.via, meta: r.meta ?? {}, createdAt: r.created_at,
  }));
  return Response.json({ messages });
}
