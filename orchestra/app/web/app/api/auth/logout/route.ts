import { NextResponse } from 'next/server';
import { SESSION_COOKIE, cookieBase } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** POST /api/auth/logout → ลบ cookie ss_session */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { ...cookieBase, maxAge: 0 });
  return res;
}
