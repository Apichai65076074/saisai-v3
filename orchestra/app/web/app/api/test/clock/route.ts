import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { clock } from '@/lib/clock';
import { fail, readJson } from '@/lib/http';
import { parseNow, testResetAllowed } from '@/lib/test-mode';

export const dynamic = 'force-dynamic';

/**
 * POST /api/test/clock {now} (ALLOW_TEST_RESET=1) → {ok, now, today}
 * เปลี่ยนแค่ "วันนี้" (app_settings.now) โดยไม่ล้างข้อมูล — เช่น ทำ QT-0001 แล้วเลื่อนเวลาไปดูว่าหมดอายุ
 * {now:'real'} = กลับไปใช้เวลาจริง
 */
export async function POST(req: Request) {
  if (!testResetAllowed()) return fail(404, { code: 'NOT_FOUND', message: 'Not found' });
  const body = await readJson(req);
  if (body.now === 'real') {
    await query(`DELETE FROM app_settings WHERE key = 'now'`);
  } else {
    if (body.now === undefined || body.now === null) return fail(400, { code: 'BAD_REQUEST', field: 'now', message: 'now is required' });
    const now = parseNow(body.now);
    if (!now) return fail(400, { code: 'BAD_REQUEST', field: 'now', message: 'now must be an ISO date-time string' });
    await query(
      `INSERT INTO app_settings (key, value)
       VALUES ('now', to_char($1::timestamptz AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [now],
    );
  }
  const c = await clock();
  return NextResponse.json({ ok: true, now: c.iso, today: c.today, fixed: c.fixed });
}

export async function GET() {
  if (!testResetAllowed()) return fail(404, { code: 'NOT_FOUND', message: 'Not found' });
  const c = await clock();
  return NextResponse.json({ ok: true, now: c.iso, today: c.today, fixed: c.fixed });
}
