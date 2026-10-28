// auth (T04) · getSession() สำหรับ server component / route handler ของ Next
// ตรวจสิทธิ์ในโค้ดงานอื่น: const s = await getSession(); if (!s) 401 · s.role === 'customer' && s.companyId ...
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { queryOne } from './db';
import {
  CHAT_COOKIE, LANG_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE, asLang, signSession, verifySession,
  type Lang, type Role,
} from './session-token';

export { CHAT_COOKIE, LANG_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE, type Lang, type Role };

export type Session = {
  userId: number;
  companyId: number | null;
  role: Role;
  lang: Lang; // cookie lang → ภาษาที่ผู้ใช้ตั้ง → th
  email: string;
};

export type UserInfo = {
  userId: number;
  code: string;
  email: string;
  displayName: string;
  displayNameEn: string;
  role: Role;
  companyId: number | null;
  companyCode: string | null;
  companyName: string | null;
  companyNameEn: string | null;
  preferredLang: Lang;
};

type UserRow = {
  id: number; code: string; email: string; display_name: string; display_name_en: string; role: Role;
  company_id: number | null; preferred_lang: string; company_code: string | null; company_name: string | null;
  company_name_en: string | null; password_hash?: string;
};

const USER_SELECT = `SELECT u.id, u.code, u.email, u.display_name, u.display_name_en, u.role, u.company_id, u.preferred_lang,
  c.code AS company_code, c.name AS company_name, c.name_en AS company_name_en
  FROM users u LEFT JOIN companies c ON c.id = u.company_id`;
// hash หลอก: เทียบรหัสเสมอแม้ไม่มีอีเมลนี้ (กันจับเวลาว่าอีเมลมีอยู่ไหม)
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.dQ5jHq6x0Yp1Q8b9Ez0vT6sV1ZyG';

function toInfo(r: UserRow): UserInfo {
  return {
    userId: r.id, code: r.code, email: r.email, displayName: r.display_name, displayNameEn: r.display_name_en,
    role: r.role, companyId: r.company_id, companyCode: r.company_code, companyName: r.company_name,
    companyNameEn: r.company_name_en, preferredLang: asLang(r.preferred_lang) ?? 'th',
  };
}

/** session ปัจจุบันจาก cookie ss_session (null = ไม่ล็อกอิน) */
export async function getSession(): Promise<Session | null> {
  const jar = cookies();
  const p = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!p) return null;
  return {
    userId: p.uid,
    companyId: p.cid,
    role: p.role,
    lang: asLang(jar.get(LANG_COOKIE)?.value) ?? p.lang ?? 'th',
    email: p.email,
  };
}

/** ภาษา: cookie lang → ภาษาที่ผู้ใช้ตั้ง → th (ใช้ได้แม้ไม่ล็อกอิน) */
export async function getLang(): Promise<Lang> {
  const c = asLang(cookies().get(LANG_COOKIE)?.value);
  if (c) return c;
  return (await getSession())?.lang ?? 'th';
}

/** chat session id (cookie ss_chat · middleware ตั้งให้ตั้งแต่ request แรก) */
export function getChatSessionId(): string | null {
  return cookies().get(CHAT_COOKIE)?.value ?? null;
}

export async function getUserInfo(userId: number): Promise<UserInfo | null> {
  const r = await queryOne<UserRow>(`${USER_SELECT} WHERE u.id = $1`, [userId]);
  return r ? toInfo(r) : null;
}

/** ตรวจอีเมล + รหัสผ่าน (bcrypt) → ข้อมูลผู้ใช้ หรือ null */
export async function verifyLogin(email: string, password: string): Promise<UserInfo | null> {
  const r = await queryOne<UserRow>(
    `${USER_SELECT.replace('SELECT u.id,', 'SELECT u.password_hash, u.id,')} WHERE lower(u.email) = lower($1)`,
    [email.trim()],
  );
  if (!r || !r.password_hash) {
    await bcrypt.compare(password, DUMMY_HASH).catch(() => false);
    return null;
  }
  return (await bcrypt.compare(password, r.password_hash)) ? toInfo(r) : null;
}

export function sessionTokenFor(u: UserInfo): Promise<string> {
  return signSession({ uid: u.userId, cid: u.companyId, role: u.role, email: u.email, lang: u.preferredLang });
}

export const isStaff = (s: Pick<Session, 'role'> | null) => !!s && (s.role === 'staff' || s.role === 'owner');
export const isOwner = (s: Pick<Session, 'role'> | null) => !!s && s.role === 'owner';
export const isCustomer = (s: Pick<Session, 'role' | 'companyId'> | null) => !!s && s.role === 'customer' && s.companyId !== null;

/** หน้าแรกหลังล็อกอินตามบทบาท (legacy SPEC ข้อ 1) */
export function homeFor(role: Role): string {
  return role === 'customer' ? '/orders' : '/staff/orders';
}

export const cookieBase = { httpOnly: true, sameSite: 'lax' as const, path: '/' };
