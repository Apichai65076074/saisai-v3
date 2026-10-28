// cookie ss_session = base64url(JSON payload) + '.' + base64url(HMAC-SHA256(SESSION_SECRET, payload)) (T04)
// ใช้ WebCrypto → ใช้ได้ทั้ง middleware (Edge) และ route handler (Node)
export const SESSION_COOKIE = 'ss_session';
export const LANG_COOKIE = 'lang';
export const CHAT_COOKIE = 'ss_chat';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // วินาที

export type Role = 'customer' | 'staff' | 'owner';
export type Lang = 'th' | 'en';

/** ข้อมูลใน cookie (id ของผู้ใช้ seed คงที่ 1–8 หลัง reset จึงไม่หลุดล็อกอิน) */
export type SessionPayload = {
  uid: number;
  cid: number | null;
  role: Role;
  email: string;
  lang: Lang; // preferred_lang ตอนล็อกอิน
  exp: number; // epoch วินาที
};

const enc = new TextEncoder();

function secret(): string {
  return process.env.SESSION_SECRET || 'saisai-dev-session-secret';
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

export async function signSession(p: Omit<SessionPayload, 'exp'>, maxAgeSec = SESSION_MAX_AGE): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...p, exp: Math.floor(Date.now() / 1000) + maxAgeSec })));
  return `${body}.${await hmac(body)}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = await hmac(body);
  if (expect.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (typeof p.uid !== 'number' || !p.role || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

export function asLang(v: unknown): Lang | null {
  return v === 'th' || v === 'en' ? v : null;
}
