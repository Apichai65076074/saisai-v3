import { NextResponse } from 'next/server';
import { LANG_COOKIE, getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { fail, readJson } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** POST /api/auth/lang {lang:'th'|'en'} → cookie lang (+ users.preferred_lang ถ้าล็อกอิน) */
export async function POST(req: Request) {
  const { lang } = await readJson(req);
  if (lang !== 'th' && lang !== 'en') return fail(400, { code: 'BAD_REQUEST', field: 'lang', message: 'lang must be th or en' });
  const s = await getSession();
  if (s) await query('UPDATE users SET preferred_lang = $1 WHERE id = $2', [lang, s.userId]).catch(() => undefined);
  const res = NextResponse.json({ ok: true, lang });
  res.cookies.set(LANG_COOKIE, lang, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}
