import { NextResponse } from 'next/server';
import { getLang, getSession, getUserInfo } from '@/lib/auth';
import { clock } from '@/lib/clock';
import { fail, msg } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** GET /api/auth/me → {ok, session:{userId,companyId,role,lang,email}, user:{…companyCode…}, lang, now, today} · ไม่ล็อกอิน 401 */
export async function GET() {
  const session = await getSession();
  if (!session) return fail(401, { code: 'UNAUTHORIZED', message: msg('UNAUTHORIZED', await getLang()) });
  const [user, c] = await Promise.all([getUserInfo(session.userId), clock()]);
  if (!user) return fail(401, { code: 'UNAUTHORIZED', message: msg('UNAUTHORIZED', session.lang) });
  return NextResponse.json({ ok: true, ...session, session, user, lang: session.lang, now: c.iso, today: c.today, fixed: c.fixed });
}
