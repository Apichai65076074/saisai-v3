import { NextResponse } from 'next/server';
import { LANG_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE, cookieBase, getLang, homeFor, sessionTokenFor, verifyLogin } from '@/lib/auth';
import { fail, msg, readJson } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** POST /api/auth/login {email, password} → cookie ss_session (HMAC · httpOnly) + lang = ภาษาที่ผู้ใช้ตั้ง */
export async function POST(req: Request) {
  const body = await readJson(req);
  const lang = await getLang();
  const email = typeof body.email === 'string' ? body.email : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const user = email && password ? await verifyLogin(email, password) : null;
  if (!user) return fail(401, { code: 'LOGIN_FAILED', message: msg('LOGIN_FAILED', lang) });
  const res = NextResponse.json({ ok: true, user, redirect: homeFor(user.role) });
  res.cookies.set(SESSION_COOKIE, await sessionTokenFor(user), { ...cookieBase, maxAge: SESSION_MAX_AGE });
  res.cookies.set(LANG_COOKIE, user.preferredLang, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}
