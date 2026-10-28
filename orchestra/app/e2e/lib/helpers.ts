// helper กลางของทุกเคส (T04): reset · login · typeSlow · hold
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { DEFAULT_NOW, PASSWORDS } from './env';

export type ResetResult = { ok: true; now: string; counts: Record<string, number>; ms: number };

/** POST /api/test/reset {now?} → ล้างข้อมูล + seed ใหม่ + ล็อก "วันนี้" (ค่าเริ่มต้น 2026-10-11T10:00:00+07:00) */
export async function reset(request: APIRequestContext, now: string = DEFAULT_NOW): Promise<ResetResult> {
  const r = await request.post('/api/test/reset', { data: { now } });
  expect(r.status(), `reset ล้ม: ${await r.text()}`).toBe(200);
  const j = (await r.json()) as ResetResult;
  expect(j.ok).toBe(true);
  return j;
}

/** POST /api/test/clock {now} → เปลี่ยนแค่ "วันนี้" ไม่ล้างข้อมูล (เช่น ทำ QT แล้วเลื่อนวันดูหมดอายุ) */
export async function setNow(request: APIRequestContext, now: string): Promise<void> {
  const r = await request.post('/api/test/clock', { data: { now } });
  expect(r.status(), `set clock ล้ม: ${await r.text()}`).toBe(200);
}

export type LoginUser = {
  userId: number; code: string; email: string; role: 'customer' | 'staff' | 'owner';
  companyId: number | null; companyCode: string | null; preferredLang: 'th' | 'en';
};

/**
 * ล็อกอินผ่าน API (เร็ว · cookie ss_session อยู่ใน context เดียวกับ page) · รหัสผ่านจาก legacy SPEC ข้อ 6
 * opts.goto = เปิดหน้านั้นต่อ (เช่น '/order')
 */
export async function login(page: Page, email: string, opts: { goto?: string } = {}): Promise<LoginUser> {
  const password = PASSWORDS[email];
  if (!password) throw new Error(`ไม่รู้รหัสผ่านของ ${email}`);
  const r = await page.request.post('/api/auth/login', { data: { email, password } });
  expect(r.status(), `login ${email} ล้ม: ${await r.text()}`).toBe(200);
  const j = (await r.json()) as { user: LoginUser };
  if (opts.goto) await page.goto(opts.goto);
  return j.user;
}

/** ล็อกอินผ่านฟอร์ม /login (เห็นในวิดีโอ) · testid login-email login-password login-submit */
export async function loginUI(page: Page, email: string): Promise<void> {
  const password = PASSWORDS[email];
  if (!password) throw new Error(`ไม่รู้รหัสผ่านของ ${email}`);
  await page.goto('/login');
  await typeSlow(page.getByTestId('login-email'), email);
  await typeSlow(page.getByTestId('login-password'), password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

export async function logout(page: Page): Promise<void> {
  await page.request.post('/api/auth/logout');
}

/** พิมพ์ทีละตัว ~60 ms (ให้เห็นในวิดีโอ) · ล้างช่องก่อน (opts.clear=false เพื่อพิมพ์ต่อ) */
export async function typeSlow(target: Locator, text: string, delay = 60, opts: { clear?: boolean } = {}): Promise<void> {
  await target.click();
  if (opts.clear !== false) await target.fill('');
  await target.pressSequentially(text, { delay });
}

/** ค้างภาพก่อนจบเคส 3–5 วิ (ค่าเริ่มต้น 3.5 วิ) */
export async function hold(page: Page, ms = 3500): Promise<void> {
  await page.waitForTimeout(ms);
}

/** อ่าน data-value ของ testid (เงิน '63023.00' · วันที่ 'YYYY-MM-DD') */
export async function dataValue(page: Page, testId: string): Promise<string | null> {
  return page.getByTestId(testId).first().getAttribute('data-value');
}

/** รอ <html data-ready="true"> (hydrate + load เสร็จ) */
export async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}
