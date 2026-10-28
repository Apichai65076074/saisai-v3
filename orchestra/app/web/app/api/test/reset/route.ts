import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { fail, readJson } from '@/lib/http';
import { parseNow, testResetAllowed } from '@/lib/test-mode';

export const dynamic = 'force-dynamic';

/**
 * POST /api/test/reset {now?} (ALLOW_TEST_RESET=1) → {ok:true, now, counts, ms}
 * = reset_test_data(now): ลบข้อมูลธุรกิจ + seed ใหม่ + ล้าง quotes/notifications/chat/tts_audio
 *   (ไม่ลบ docs/doc_chunks/eval_runs/load_runs) + app_settings.now = now ?? '2026-10-11T10:00:00+07:00'
 */
export async function POST(req: Request) {
  if (!testResetAllowed()) return fail(404, { code: 'NOT_FOUND', message: 'Not found' });
  const body = await readJson(req);
  const now = parseNow(body.now);
  if (!now) return fail(400, { code: 'BAD_REQUEST', field: 'now', message: 'now must be an ISO date-time string' });
  const t0 = Date.now();
  const row = await queryOne<{ counts: Record<string, number> }>('SELECT reset_test_data($1::timestamptz) AS counts', [now]);
  return NextResponse.json({ ok: true, now, counts: row?.counts ?? {}, ms: Date.now() - t0 });
}

export async function GET() {
  return fail(testResetAllowed() ? 405 : 404, { code: 'METHOD', message: 'Use POST' });
}
