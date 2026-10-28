import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/health → {ok:true, db} (db = ต่อฐานข้อมูลได้หรือไม่) */
export async function GET() {
  let db = false;
  try {
    await pool.query('SELECT 1');
    db = true;
  } catch {
    db = false;
  }
  return NextResponse.json({ ok: true, db, mode: process.env.MODE || 'mock' });
}
