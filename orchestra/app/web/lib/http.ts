// ตัวช่วย route handler (T04) · error รูปแบบเดิม {"ok":false,"errors":[{code,message,field?}]}
import { NextResponse } from 'next/server';

export type ApiError = { code: string; message: string; field?: string; params?: Record<string, unknown> };

export function fail(status: number, errors: ApiError | ApiError[]): NextResponse {
  return NextResponse.json({ ok: false, errors: Array.isArray(errors) ? errors : [errors] }, { status });
}

/** อ่าน JSON body · body ว่าง/ผิดรูป → {} */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const MSG: Record<string, { th: string; en: string }> = {
  UNAUTHORIZED: { th: 'กรุณาเข้าสู่ระบบ', en: 'Please log in' },
  FORBIDDEN: { th: 'ไม่มีสิทธิ์เข้าถึง', en: 'Access denied' },
  LOGIN_FAILED: { th: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', en: 'Incorrect email or password' },
  BAD_REQUEST: { th: 'ข้อมูลไม่ถูกต้อง', en: 'Invalid request' },
  SERVER_ERROR: { th: 'เกิดข้อผิดพลาด กรุณาลองใหม่', en: 'Something went wrong. Please try again' },
  NOT_FOUND: { th: 'ไม่พบข้อมูล', en: 'Not found' },
};

/** ข้อความกลางของ T04 (legacy SPEC ข้อ 4) · รหัสธุรกิจอื่นอยู่ที่ lib/i18n (T07) */
export function msg(code: keyof typeof MSG | string, lang: 'th' | 'en' = 'th'): string {
  return MSG[code]?.[lang] ?? code;
}
