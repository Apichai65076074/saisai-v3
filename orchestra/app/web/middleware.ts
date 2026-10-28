// middleware (T04): cookie ss_chat (uuid ของแชท) · cookie lang · กันหน้าหลังร้าน/หน้าลูกค้าเมื่อไม่ล็อกอินหรือสิทธิ์ไม่พอ
import { NextResponse, type NextRequest } from 'next/server';
import { CHAT_COOKIE, LANG_COOKIE, SESSION_COOKIE, verifySession, type Role } from './lib/session-token';

/** หน้า → บทบาทที่เข้าได้ (ไม่ตรง/ไม่ล็อกอิน → /login?next=…) · API ตรวจสิทธิ์เองในแต่ละ route */
const GUARDS: { prefix: string; roles: Role[] }[] = [
  { prefix: '/staff', roles: ['staff', 'owner'] },
  { prefix: '/owner', roles: ['owner'] },
  { prefix: '/admin', roles: ['owner'] },
  { prefix: '/order', roles: ['customer'] }, // /order และ /orders/*
  { prefix: '/claims', roles: ['customer'] },
  { prefix: '/samples', roles: ['customer'] },
  { prefix: '/quotes', roles: ['customer'] },
];

const YEAR = 60 * 60 * 24 * 365;

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (!pathname.startsWith('/api/')) {
    const guard = GUARDS.find((g) => pathname === g.prefix || pathname.startsWith(g.prefix + '/') || (g.prefix === '/order' && pathname.startsWith('/orders')));
    if (guard) {
      const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
      if (!s || !guard.roles.includes(s.role)) {
        const url = req.nextUrl.clone();
        // พนักงาน/เจ้าของเปิดหน้าลูกค้า → หน้ารวมออเดอร์หลังร้าน (legacy SPEC ข้อ 1)
        if (s && guard.roles.includes('customer') && s.role !== 'customer') {
          url.pathname = '/staff/orders';
          url.search = '';
        } else {
          url.pathname = '/login';
          url.search = `?next=${encodeURIComponent(pathname + search)}`;
        }
        return NextResponse.redirect(url);
      }
    }
  }

  // ss_chat: ตั้งตั้งแต่ request แรก (ส่งต่อใน header cookie ให้ handler อ่านได้ทันที)
  const chatId = req.cookies.get(CHAT_COOKIE)?.value;
  const lang = req.cookies.get(LANG_COOKIE)?.value;
  if (chatId && (lang === 'th' || lang === 'en')) return NextResponse.next();

  const setChat = chatId ? null : crypto.randomUUID();
  let setLang: 'th' | 'en' | null = null;
  if (lang !== 'th' && lang !== 'en') {
    const s = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    setLang = s?.lang ?? 'th';
  }
  const reqHeaders = new Headers(req.headers);
  const extra = [setChat ? `${CHAT_COOKIE}=${setChat}` : '', setLang ? `${LANG_COOKIE}=${setLang}` : ''].filter(Boolean).join('; ');
  const cookie = reqHeaders.get('cookie');
  reqHeaders.set('cookie', cookie ? `${cookie}; ${extra}` : extra);
  const res = NextResponse.next({ request: { headers: reqHeaders } });
  if (setChat) res.cookies.set(CHAT_COOKIE, setChat, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: YEAR });
  if (setLang) res.cookies.set(LANG_COOKIE, setLang, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: YEAR });
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|img/|assets/).*)'],
};
