// "วันนี้" ของระบบ (T04) · ไม่พึ่ง Next → worker import ได้ (หรือใช้ CLOCK_SQL เดียวกัน)
// app_settings.now (ตั้งโดย POST /api/test/reset) หรือเวลาจริงถ้าไม่มีแถว · เวลา Asia/Bangkok (UTC+7 ไม่มี DST)
import type { Db } from './db';

/** SQL เดียวกับที่ worker ใช้ · คืน 1 แถว {now: timestamptz, fixed: boolean} */
export const CLOCK_SQL = `SELECT COALESCE(s.value::timestamptz, now()) AS now, (s.value IS NOT NULL) AS fixed
  FROM (SELECT 1) one LEFT JOIN app_settings s ON s.key = 'now' AND s.value IS NOT NULL AND s.value <> ''`;

export type Clock = { now: Date; iso: string; today: string; fixed: boolean };

const BKK_MS = 7 * 60 * 60 * 1000;

/** จุดเวลา → 'YYYY-MM-DD' เวลาไทย */
export function bkkDate(at: Date): string {
  return new Date(at.getTime() + BKK_MS).toISOString().slice(0, 10);
}

/** จุดเวลา → ISO '2026-10-11T10:00:00+07:00' */
export function bkkIso(at: Date): string {
  return new Date(at.getTime() + BKK_MS).toISOString().slice(0, 19) + '+07:00';
}

async function defaultDb(): Promise<Db> {
  return (await import('./db')).pool;
}

/** เวลา "ตอนนี้" ของระบบ */
export async function now(db?: Db): Promise<Date> {
  return (await clock(db)).now;
}

/** {now, iso, today (YYYY-MM-DD ไทย), fixed (ล็อกเวลาอยู่หรือไม่)} */
export async function clock(db?: Db): Promise<Clock> {
  const r = await (db ?? (await defaultDb())).query<{ now: Date; fixed: boolean }>(CLOCK_SQL);
  const row = r.rows[0];
  const at = row?.now ? new Date(row.now) : new Date();
  return { now: at, iso: bkkIso(at), today: bkkDate(at), fixed: !!row?.fixed };
}
